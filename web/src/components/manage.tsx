"use client";

import { useState } from "react";
import { isAddress, type Address, type Hex } from "viem";
import type { AgentSnapshot } from "@/lib/chain";
import { lifecycleAbi } from "@/lib/chain";
import { LIFECYCLE_REGISTRY } from "@/lib/config";
import { alpDigest, evidenceDocument, newOperationId, operationKey, stateIndex, type StateName } from "@/lib/alp";
import { sameAddr } from "@/lib/checks";
import { errorText, useWallet } from "@/lib/wallet";
import { downloadJson, sendAndWait } from "@/lib/tx";
import { ConnectButton } from "./chrome";
import { Addr, Button, Field, Notice, inputCls } from "./ui";

type Action = "activate" | "suspend" | "retire" | "rebind" | "flag";

const COPY: Record<Action, { title: string; to: StateName | null; explain: string; button: string; danger?: boolean }> = {
  activate: {
    title: "Activate",
    to: "ACTIVE",
    button: "Stamp ACTIVE",
    explain:
      "BAP-728 says activate only after the agent made one real payment on its self-funding rail and the provider credited it. Put the payment transaction and the provider receipt in the evidence below. The new authority epoch must match the lease your runtime holds.",
  },
  suspend: {
    title: "Suspend",
    to: "SUSPENDED",
    button: "Stamp SUSPENDED",
    explain: "Stops the agent from being treated as open for work. It can be resumed later by the controller.",
  },
  retire: {
    title: "Retire",
    to: "RETIRED",
    button: "Retire permanently",
    danger: true,
    explain:
      "Final. No one can reactivate this identity in this registry, including a future owner. Revoke the agent's allowances and outstanding authorizations too; the chain only records the retirement.",
  },
  rebind: {
    title: "Re-bind authority",
    to: null,
    button: "Re-bind",
    explain:
      "Records the current owner and wallet, appoints a controller and an approved policy, and raises the authority epoch so every earlier runtime lease is invalid. Needed after a sale or a wallet change, and to change policy.",
  },
  flag: {
    title: "Flag binding change",
    to: "SUSPENDED",
    button: "Suspend this agent",
    explain:
      "The owner or wallet on the identity registry no longer matches this record. Anyone may suspend it; the contract checks the mismatch itself.",
  },
};

export function ManagePanel({ snap, onDone }: { snap: AgentSnapshot; onDone: () => void }) {
  const w = useWallet();
  const r = snap.record;
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [links, setLinks] = useState("");
  const [epoch, setEpoch] = useState("");
  const [controller, setController] = useState("");
  const [policy, setPolicy] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: Hex; evidence?: unknown; action: Action } | null>(null);

  if (!r) return <Notice>Nothing to manage until the passport exists.</Notice>;
  if (r.retired) return <Notice>Retired. This record cannot change again.</Notice>;

  const mismatch = snap.live && !(snap.live.ownerMatches && snap.live.walletMatches);
  const isOwner = sameAddr(w.account, snap.owner);
  const isController = sameAddr(w.account, r.controller);
  const frozen = !sameAddr(snap.owner, r.ownerSnapshot);

  const available: Action[] = [];
  if (isController && !frozen && (r.state === "REGISTERED" || r.state === "SUSPENDED")) available.push("activate");
  if ((isOwner || isController) && (r.state === "ACTIVE" || r.state === "REGISTERED")) available.push("suspend");
  if (isOwner || (isController && !frozen)) available.push("retire");
  if (isOwner && r.state !== "ACTIVE") available.push("rebind");
  if (mismatch && (r.state === "ACTIVE" || r.state === "REGISTERED")) available.push("flag");

  const start = (a: Action) => {
    setAction(a);
    setError(null);
    setDone(null);
    setNote("");
    setLinks("");
    setEpoch((r.authorityEpoch + 1n).toString());
    setController(r.controller);
    setPolicy(r.policyDigest);
  };

  const run = async () => {
    if (!action || !LIFECYCLE_REGISTRY) return;
    setError(null);
    try {
      await w.ensureChain();
      const client = w.client();
      const actor = w.account as Address;
      if (action === "flag") {
        setBusy("Confirm in your wallet");
        const rec = await sendAndWait(
          client,
          { address: LIFECYCLE_REGISTRY, abi: lifecycleAbi, functionName: "flagMismatch", args: [snap.agentId] },
          () => setBusy("Waiting for the block"),
        );
        setDone({ hash: rec.transactionHash, action });
        onDone();
        return;
      }
      const to: StateName = action === "rebind" ? r.state : COPY[action].to!;
      const operationId = newOperationId(action, snap.agentId);
      const doc = evidenceDocument({
        agentId: snap.agentId,
        from: r.state,
        to,
        operationId,
        note: note.trim(),
        links: links
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
        actor,
      });
      const evidence = alpDigest(doc);
      const opKey = operationKey(operationId);
      let call;
      if (action === "rebind") {
        if (!isAddress(controller)) throw new Error("Controller must be an address.");
        if (!/^0x[0-9a-f]{64}$/.test(policy)) throw new Error("Policy digest must be 0x plus 64 lowercase hex characters.");
        call = {
          address: LIFECYCLE_REGISTRY,
          abi: lifecycleAbi,
          functionName: "rebind",
          args: [snap.agentId, r.sequence, controller as Address, policy as Hex, evidence, opKey],
        };
      } else {
        const ep = action === "activate" ? BigInt(epoch || "0") : r.authorityEpoch;
        if (action === "activate" && ep <= r.authorityEpoch) throw new Error(`The new epoch must be above ${r.authorityEpoch}.`);
        call = {
          address: LIFECYCLE_REGISTRY,
          abi: lifecycleAbi,
          functionName: "transition",
          args: [snap.agentId, r.sequence, stateIndex(to), ep, r.policyDigest, evidence, opKey],
        };
      }
      // Keep the evidence before anything can fail: the hash on chain is useless without it.
      const record = { evidence_digest: evidence, operation_id: operationId, document: doc };
      downloadJson(`stamp-${snap.agentId}-${action}-evidence.json`, record);
      setBusy("Confirm in your wallet");
      const rec = await sendAndWait(client, call as never, () => setBusy("Waiting for the block"));
      setDone({ hash: rec.transactionHash, evidence: record, action });
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (!w.account) {
    return (
      <div className="space-y-3 rounded-xl border border-rule bg-card p-5">
        <p className="text-sm text-ink-2">Connect the owner or controller wallet to change this record.</p>
        {mismatch ? (
          <p className="text-sm text-suspended">The binding changed. Anyone can suspend this passport after connecting.</p>
        ) : null}
        <ConnectButton compact />
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-rule bg-card p-5">
      <p className="text-sm text-ink-2">
        Connected as {isOwner ? "the owner" : isController ? "the controller" : "a visitor"}
        {frozen && isController ? ", frozen to suspend-only because the owner changed" : ""}.
      </p>
      {available.length === 0 ? (
        <p className="text-sm text-muted">This wallet has no action available on this record right now.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {available.map((a) => (
            <Button key={a} variant={action === a ? "primary" : COPY[a].danger ? "danger" : "secondary"} onClick={() => start(a)}>
              {COPY[a].title}
            </Button>
          ))}
        </div>
      )}

      {action ? (
        <div className="space-y-4 border-t border-rule pt-4">
          <p className="text-sm leading-relaxed text-ink-2">{COPY[action].explain}</p>
          {action === "activate" ? (
            <Field label="New authority epoch" hint={`Must be above ${r.authorityEpoch} and match your lease service.`}>
              <input className={inputCls} inputMode="numeric" value={epoch} onChange={(e) => setEpoch(e.target.value.replace(/\D/g, ""))} />
            </Field>
          ) : null}
          {action === "rebind" ? (
            <>
              <Field label="Controller" hint="Cannot be the agent wallet.">
                <input className={`${inputCls} hash`} value={controller} onChange={(e) => setController(e.target.value.trim())} />
              </Field>
              <Field label="Policy digest" hint="Keep the current one, or paste the digest of a new policy you approved on the Issue page.">
                <input className={`${inputCls} hash`} value={policy} onChange={(e) => setPolicy(e.target.value.trim().toLowerCase())} />
              </Field>
            </>
          ) : null}
          {action !== "flag" ? (
            <>
              <Field label="Evidence note" hint="Why this change is happening. Stays in your evidence file; only its hash goes on chain.">
                <textarea className={`${inputCls} min-h-20`} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Field label="Evidence links" hint="Transaction hashes, receipts or URLs, separated by spaces.">
                <input className={inputCls} value={links} onChange={(e) => setLinks(e.target.value)} />
              </Field>
              <p className="text-xs text-muted">
                Your evidence file downloads before the wallet opens. Keep it: it is the only way to show what the hash on
                chain refers to.
              </p>
            </>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={COPY[action].danger ? "danger" : "primary"} onClick={run} disabled={!!busy || (action === "activate" && !note.trim())}>
              {busy ?? COPY[action].button}
            </Button>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={!!busy}>
              Cancel
            </Button>
          </div>
          {action === "activate" && !note.trim() ? <p className="text-xs text-muted">Describe the funding evidence to continue.</p> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
        </div>
      ) : null}

      {done ? (
        <Notice tone="ok">
          Stamped in <Addr value={done.hash} kind="tx" />.
          {done.evidence ? (
            <button className="ml-2 underline" onClick={() => downloadJson(`stamp-${snap.agentId}-${done.action}-evidence.json`, done.evidence)}>
              Download evidence again
            </button>
          ) : null}
        </Notice>
      ) : null}
    </div>
  );
}
