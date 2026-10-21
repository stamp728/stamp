"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { decodeEventLog, isAddress, getAddress, type Address, type Hex } from "viem";
import { identityAbi, lifecycleAbi, publicClient, readAgent, type AgentSnapshot } from "@/lib/chain";
import { CHAIN_ID, IDENTITY_REGISTRY, LIFECYCLE_REGISTRY } from "@/lib/config";
import {
  REGISTRATION_TYPE,
  agentWalletTypedData,
  alpDigest,
  alpServiceOf,
  decodeDataUri,
  evidenceDocument,
  newOperationId,
  operationKey,
  policyApprovalTypedData,
  policyBody,
  registrationDataUri,
  type PolicyAsset,
  type RegistrationFile,
} from "@/lib/alp";
import { validateRecord } from "@/lib/schema";
import { sameAddr } from "@/lib/checks";
import { downloadJson, sendAndWait } from "@/lib/tx";
import { errorText, useWallet } from "@/lib/wallet";
import { ConnectButton } from "./chrome";
import { Addr, Button, Field, Notice, Spinner, inputCls } from "./ui";

// ------------------------------------------------------------------ local journal

/** ALP keeps DRAFT/PROVISIONED progress durably on the owner's side; here, in this browser. */
type Journal = {
  agentId?: string;
  registerTx?: Hex;
  walletTx?: Hex;
  agentWallet?: Address;
  policy?: unknown;
  policyDigest?: Hex;
  recordTx?: Hex;
};

const jKey = (owner: string) => `stamp:journal:${CHAIN_ID}:${owner.toLowerCase()}`;
function readJournal(owner: string): Journal {
  try {
    return JSON.parse(localStorage.getItem(jKey(owner)) || "{}");
  } catch {
    return {};
  }
}
function writeJournal(owner: string, j: Journal) {
  try {
    localStorage.setItem(jKey(owner), JSON.stringify(j));
  } catch {
    /* private mode: progress lives in memory only */
  }
}

// ------------------------------------------------------------------ assets

const ASSETS: { label: string; address: Address; decimals: number }[] = [
  { label: "USDT (BSC-USD)", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
  { label: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
];

function toUnits(v: string, decimals: number): string {
  const t = v.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`"${v}" is not a number`);
  const [i, f = ""] = t.split(".");
  if (f.length > decimals) throw new Error(`"${v}" has more than ${decimals} decimals`);
  const s = (i + f.padEnd(decimals, "0")).replace(/^0+(?=\d)/, "");
  return s === "" ? "0" : s;
}

// ------------------------------------------------------------------ wizard

export function RegisterWizard({ presetAgent }: { presetAgent?: string }) {
  const w = useWallet();
  // Pinned on first connect: step 2 asks the user to switch the extension to the agent wallet,
  // and that must not turn the agent wallet into "the owner".
  const [owner, setOwner] = useState<Address | null>(null);
  useEffect(() => {
    if (!owner && w.account) setOwner(w.account);
  }, [owner, w.account]);
  const [journal, setJournal] = useState<Journal>({});
  const [snap, setSnap] = useState<AgentSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!owner) return;
    const j = readJournal(owner);
    if (presetAgent && j.agentId !== presetAgent) {
      setJournal({ agentId: presetAgent });
    } else setJournal(j);
  }, [owner, presetAgent]);

  const save = (patch: Journal) => {
    setJournal((prev) => {
      const next = { ...prev, ...patch };
      if (owner) writeJournal(owner, next);
      return next;
    });
  };

  const reload = async (agentId?: string) => {
    const id = agentId ?? journal.agentId;
    if (!id) return setSnap(null);
    setLoading(true);
    try {
      setSnap(await readAgent(BigInt(id)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload(); // eslint-disable-line react-hooks/exhaustive-deps
  }, [journal.agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!LIFECYCLE_REGISTRY) {
    return <Notice tone="warn">The lifecycle registry is not deployed yet, so passports cannot be issued. Check back soon.</Notice>;
  }

  if (!owner) {
    return (
      <div className="space-y-4 rounded-2xl border border-rule bg-card p-6">
        <h2 className="font-serif text-2xl">Connect the owner wallet</h2>
        <p className="text-sm leading-relaxed text-ink-2">
          This is the wallet that will own the agent&apos;s identity. Use a wallet you keep safe: the owner can suspend
          and retire the agent and appoints who controls it. The agent&apos;s own spending wallet comes in step 2 and must be
          a different one.
        </p>
        <ConnectButton />
      </div>
    );
  }

  const ownsIt = snap ? sameAddr(snap.owner, owner) : false;
  const walletOk = snap && snap.wallet && !sameAddr(snap.wallet, snap.owner);
  const step1 = !!(journal.agentId && snap?.exists && ownsIt);
  const step2 = !!(step1 && walletOk);
  const step3 = !!(step2 && journal.policyDigest);
  const recorded = !!snap?.record;

  return (
    <div className="space-y-6">
      <Notice>
        Owner <span className="hash">{owner}</span>. Progress is saved in this browser, so you can close the tab and
        continue later.
        {w.account && !sameAddr(w.account, owner) ? (
          <>
            {" "}Your extension is now on <span className="hash">{w.account}</span>.{" "}
            <button className="underline" onClick={() => setOwner(w.account)}>
              Make this the owner instead
            </button>
          </>
        ) : null}
      </Notice>

      <StepCard n={1} title="Identity" done={step1} open={!step1}>
        <IdentityStep owner={owner} journal={journal} snap={snap} loading={loading} onAgent={(id, tx) => save({ agentId: id, registerTx: tx })} />
      </StepCard>

      <StepCard n={2} title="Agent wallet" done={step2} open={step1 && !step2} locked={!step1}>
        {step1 && snap ? (
          <WalletStep
            owner={owner}
            snap={snap}
            onBound={async (wallet, tx) => {
              save({ agentWallet: wallet, walletTx: tx });
              await reload();
            }}
          />
        ) : null}
      </StepCard>

      <StepCard n={3} title="Spending policy" done={step3} open={step2 && !step3 && !recorded} locked={!step2}>
        {step2 && snap ? <PolicyStep owner={owner} agentId={snap.agentId} onApproved={(policy, digest) => save({ policy, policyDigest: digest })} /> : null}
      </StepCard>

      <StepCard n={4} title="Controller and passport" done={recorded} open={step3 && !recorded} locked={!step3 && !recorded}>
        {recorded && snap ? (
          <Notice tone="ok">
            Passport issued. <Link className="underline" href={`/agent/${snap.agentId}`}>Open agent #{snap.agentId.toString()}</Link>
          </Notice>
        ) : step3 && snap ? (
          <RecordStep
            owner={owner}
            snap={snap}
            journal={journal}
            onRecorded={async (tx) => {
              save({ recordTx: tx });
              await reload();
            }}
          />
        ) : null}
      </StepCard>
    </div>
  );
}

function StepCard({
  n,
  title,
  done,
  open,
  locked,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  open: boolean;
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border bg-card ${open ? "border-ink" : "border-rule"} ${locked ? "opacity-60" : ""}`}>
      <header className="flex items-center gap-3 px-5 py-4 sm:px-6">
        <span
          className={`grid size-7 place-items-center rounded-full border text-sm ${done ? "border-active bg-active text-paper" : "border-rule-strong text-ink"}`}
          aria-hidden
        >
          {done ? "✓" : n}
        </span>
        <h2 className="font-medium text-ink">{title}</h2>
        {done ? <span className="ml-auto text-xs text-active">Done</span> : locked ? <span className="ml-auto text-xs text-muted">After step {n - 1}</span> : null}
      </header>
      {!locked ? <div className={`border-t border-rule px-5 py-5 sm:px-6 ${!open && done ? "text-sm" : ""}`}>{children}</div> : null}
    </section>
  );
}

// ------------------------------------------------------------------ step 1

function IdentityStep({
  owner,
  journal,
  snap,
  loading,
  onAgent,
}: {
  owner: Address;
  journal: Journal;
  snap: AgentSnapshot | null;
  loading: boolean;
  onAgent: (id: string, tx?: Hex) => void;
}) {
  const w = useWallet();
  const [mode, setMode] = useState<"new" | "existing">(journal.agentId ? "existing" : "new");
  const [existing, setExisting] = useState(journal.agentId ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [origin, setOrigin] = useState("");
  const [web, setWeb] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (journal.agentId && snap?.exists && sameAddr(snap.owner, owner)) {
    const file = snap.tokenURI ? safeDecode(snap.tokenURI) : null;
    const svc = alpServiceOf(file);
    return (
      <div className="space-y-3 text-sm">
        <p className="text-ink-2">
          Agent <Link className="underline" href={`/agent/${journal.agentId}`}>#{journal.agentId}</Link>, owned by this wallet.
          {journal.registerTx ? (
            <>
              {" "}Registered in <Addr value={journal.registerTx} kind="tx" />.
            </>
          ) : null}
        </p>
        {!svc ? <AddAlpService agentId={BigInt(journal.agentId)} tokenURI={snap.tokenURI} /> : null}
        <button className="text-xs text-muted underline" onClick={() => onAgent("")}>
          Use a different agent
        </button>
      </div>
    );
  }

  const originOk = /^https:\/\/[^/\s?#]+$/.test(origin.trim().replace(/\/$/, ""));

  const registerNew = async () => {
    setError(null);
    try {
      if (!name.trim() || !description.trim()) throw new Error("Name and description are required.");
      if (!originOk) throw new Error("The agent origin must look like https://agent.example.com, without a path.");
      if (image && !/^https:\/\//.test(image)) throw new Error("Image must be an https URL.");
      const o = origin.trim().replace(/\/$/, "");
      const services = [{ name: "ALP", endpoint: `${o}/.well-known/alp.json`, version: "0.4-draft" }];
      if (web.trim()) services.push({ name: "web", endpoint: web.trim(), version: "" });
      const file: RegistrationFile = {
        type: REGISTRATION_TYPE,
        name: name.trim(),
        description: description.trim(),
        image: image.trim(),
        services: services.map((s) => (s.version ? s : { name: s.name, endpoint: s.endpoint })),
        registrations: [],
      };
      const uri = registrationDataUri(file);
      await w.ensureChain();
      setBusy("Confirm in your wallet");
      const rec = await sendAndWait(
        w.client(),
        { address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "register", args: [uri] },
        () => setBusy("Waiting for the block"),
      );
      const log = rec.logs
        .filter((l) => sameAddr(l.address, IDENTITY_REGISTRY))
        .map((l) => {
          try {
            return decodeEventLog({ abi: identityAbi, data: l.data, topics: l.topics });
          } catch {
            return null;
          }
        })
        .find((d) => d?.eventName === "Registered");
      if (!log) throw new Error("Registered event not found in the receipt.");
      onAgent((log.args as { agentId: bigint }).agentId.toString(), rec.transactionHash);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-2" role="tablist">
        <Button variant={mode === "new" ? "primary" : "secondary"} onClick={() => setMode("new")}>
          New agent
        </Button>
        <Button variant={mode === "existing" ? "primary" : "secondary"} onClick={() => setMode("existing")}>
          I already have an ERC-8004 ID
        </Button>
      </div>

      {mode === "existing" ? (
        <div className="space-y-3">
          <Field label="Agent ID" hint="The ERC-8004 ID on BNB Smart Chain, owned by the connected wallet.">
            <input className={inputCls} inputMode="numeric" value={existing} onChange={(e) => setExisting(e.target.value.replace(/\D/g, ""))} />
          </Field>
          {loading ? <Spinner label="Checking ownership" /> : null}
          {journal.agentId && snap && !snap.exists ? <Notice tone="error">No agent #{journal.agentId} on BNB Smart Chain.</Notice> : null}
          {journal.agentId && snap?.exists && !sameAddr(snap.owner, owner) ? (
            <Notice tone="error">
              Agent #{journal.agentId} is owned by <Addr value={snap.owner!} />, not by the connected wallet.
            </Notice>
          ) : null}
          <Button onClick={() => existing && onAgent(BigInt(existing).toString())} disabled={!existing}>
            Use this agent
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input className={inputCls} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Image URL" hint="Optional, https.">
            <input className={inputCls} value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description" hint="What the agent does, in plain words. Stored on chain.">
              <textarea className={`${inputCls} min-h-24`} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
          <Field
            label="Agent origin"
            hint={
              <>
                Where the agent will serve <code>/.well-known/alp.json</code> and its handshake. You can set it up after
                issuing the passport; the <Link className="underline" href="/docs/builders">builder guide</Link> has a
                ready server.
              </>
            }
          >
            <input className={inputCls} value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="https://agent.example.com" />
          </Field>
          <Field label="Website or app URL" hint="Optional.">
            <input className={inputCls} value={web} onChange={(e) => setWeb(e.target.value)} placeholder="https://" />
          </Field>
          <div className="space-y-3 sm:col-span-2">
            <p className="text-xs leading-relaxed text-muted">
              The registration file is stored on chain as a data URI, in the same format the BNBAgent SDK uses. Nothing is
              hosted by Stamp.
            </p>
            <Button onClick={registerNew} disabled={!!busy || !name || !description || !originOk}>
              {busy ?? "Register on ERC-8004"}
            </Button>
          </div>
        </div>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

function safeDecode(uri: string): unknown {
  try {
    return decodeDataUri(uri);
  } catch {
    return null;
  }
}

/** Existing agents (e.g. made with the SDK) often lack the ALP service. Offer to add it. */
function AddAlpService({ agentId, tokenURI }: { agentId: bigint; tokenURI: string | null }) {
  const w = useWallet();
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Hex | null>(null);
  const file = tokenURI ? safeDecode(tokenURI) : null;
  if (done) return <Notice tone="ok">ALP service added in <Addr value={done} kind="tx" />.</Notice>;
  if (!file)
    return (
      <Notice tone="warn">
        The registration file is hosted outside the chain, so Stamp cannot edit it. Add a service{" "}
        <code>{`{"name":"ALP","endpoint":"https://<agent>/.well-known/alp.json"}`}</code> to it yourself.
      </Notice>
    );
  const ok = /^https:\/\/[^/\s?#]+$/.test(origin.trim().replace(/\/$/, ""));
  return (
    <div className="space-y-3 rounded-lg border border-rule p-4">
      <p className="text-ink-2">
        The registration file has no ALP service, so clients cannot find the agent&apos;s handshake. Add it now (optional,
        one transaction):
      </p>
      <Field label="Agent origin">
        <input className={inputCls} value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="https://agent.example.com" />
      </Field>
      <Button
        variant="secondary"
        disabled={!ok || !!busy}
        onClick={async () => {
          setError(null);
          try {
            const f = file as RegistrationFile;
            const services = Array.isArray(f.services) ? f.services.filter((s) => s?.name?.toUpperCase() !== "ALP") : [];
            services.push({ name: "ALP", endpoint: `${origin.trim().replace(/\/$/, "")}/.well-known/alp.json`, version: "0.4-draft" });
            const uri = registrationDataUri({ ...f, services });
            await w.ensureChain();
            setBusy("Confirm in your wallet");
            const rec = await sendAndWait(
              w.client(),
              { address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "setAgentURI", args: [agentId, uri] },
              () => setBusy("Waiting for the block"),
            );
            setDone(rec.transactionHash);
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(null);
          }
        }}
      >
        {busy ?? "Add ALP service"}
      </Button>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

// ------------------------------------------------------------------ step 2

function WalletStep({ owner, snap, onBound }: { owner: Address; snap: AgentSnapshot; onBound: (w: Address, tx: Hex) => Promise<void> }) {
  const w = useWallet();
  const bound = snap.wallet && !sameAddr(snap.wallet, owner) ? snap.wallet : null;
  const [agentWallet, setAgentWallet] = useState("");
  const [prepared, setPrepared] = useState<{ wallet: Address; deadline: bigint; typed: ReturnType<typeof agentWalletTypedData> } | null>(null);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  if (bound && !prepared) {
    return (
      <div className="space-y-2 text-sm text-ink-2">
        <p>
          Agent wallet <Addr value={bound} /> is bound and verified by the registry.
        </p>
      </div>
    );
  }

  const valid = isAddress(agentWallet) && !sameAddr(agentWallet as Address, owner);
  const left = prepared ? Number(prepared.deadline) - now : 0;

  const prepare = async () => {
    setError(null);
    setSignature("");
    try {
      const wallet = getAddress(agentWallet);
      const [domain, block] = await Promise.all([
        publicClient.readContract({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "eip712Domain" }),
        publicClient.getBlock(),
      ]);
      // Registry rule: deadline at most 5 minutes after the block that executes the call.
      const deadline = block.timestamp + 240n;
      const typed = agentWalletTypedData({
        agentId: snap.agentId,
        newWallet: wallet,
        owner,
        deadline,
        domain: { name: domain[1], version: domain[2], chainId: Number(domain[3]), verifyingContract: domain[4] },
      });
      setPrepared({ wallet, deadline, typed });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const signHere = async () => {
    if (!prepared) return;
    setError(null);
    try {
      if (!sameAddr(w.account, prepared.wallet)) throw new Error("Switch your wallet extension to the agent wallet first.");
      setBusy("Sign in your wallet");
      const sig = await w.client().signTypedData({ account: prepared.wallet, ...prepared.typed });
      setSignature(sig);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!prepared) return;
    setError(null);
    try {
      if (!sameAddr(w.account, owner)) throw new Error("Switch your wallet extension back to the owner wallet to submit.");
      if (!/^0x[0-9a-fA-F]{130}$/.test(signature.trim()) && !/^0x[0-9a-fA-F]+$/.test(signature.trim()))
        throw new Error("Paste the signature as 0x-prefixed hex.");
      await w.ensureChain();
      setBusy("Confirm in your wallet");
      const rec = await sendAndWait(
        w.client(),
        {
          address: IDENTITY_REGISTRY,
          abi: identityAbi,
          functionName: "setAgentWallet",
          args: [snap.agentId, prepared.wallet, prepared.deadline, signature.trim() as Hex],
        },
        () => setBusy("Waiting for the block"),
      );
      const readBack = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: identityAbi,
        functionName: "getAgentWallet",
        args: [snap.agentId],
        blockNumber: rec.blockNumber,
      });
      if (!sameAddr(readBack, prepared.wallet)) throw new Error(`Registry reads back ${readBack}, not the agent wallet.`);
      setPrepared(null);
      await onBound(prepared.wallet, rec.transactionHash);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const typedJson = prepared
    ? JSON.stringify(
        {
          ...prepared.typed,
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            ...prepared.typed.types,
          },
          message: { ...prepared.typed.message, agentId: prepared.typed.message.agentId.toString(), deadline: prepared.typed.message.deadline.toString() },
        },
        null,
        2,
      )
    : "";

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ink-2">
        The agent signs and pays with its own wallet, never the owner&apos;s. That wallet must sign a message accepting this
        identity; the registry checks the signature before binding it. Use a fresh wallet that only this agent uses.
      </p>
      {!prepared ? (
        <>
          <Field label="Agent wallet address" hint="Must differ from the owner wallet. Smart-contract wallets (ERC-1271) work too.">
            <input className={`${inputCls} hash`} value={agentWallet} onChange={(e) => setAgentWallet(e.target.value.trim())} placeholder="0x…" />
          </Field>
          {agentWallet && isAddress(agentWallet) && sameAddr(agentWallet as Address, owner) ? (
            <Notice tone="error">That is the owner wallet. BAP-728 requires a dedicated agent wallet.</Notice>
          ) : null}
          <Button onClick={prepare} disabled={!valid}>
            Prepare signature request
          </Button>
        </>
      ) : (
        <div className="space-y-5">
          <p className={`text-sm ${left < 60 ? "text-retired" : "text-muted"}`}>
            {left > 0 ? `This request expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}.` : "Expired. Prepare a new one."}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-rule p-4">
              <p className="text-sm font-medium text-ink">Option A · same browser wallet</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
                <li>Switch your extension to the agent wallet {sameAddr(w.account, prepared.wallet) ? "(done)" : ""}</li>
                <li>Sign the request</li>
                <li>Switch back to the owner and submit</li>
              </ol>
              <Button variant="secondary" onClick={signHere} disabled={!!busy || left <= 0 || !sameAddr(w.account, prepared.wallet)}>
                {busy === "Sign in your wallet" ? busy : "Sign as agent wallet"}
              </Button>
            </div>
            <div className="space-y-3 rounded-lg border border-rule p-4">
              <p className="text-sm font-medium text-ink">Option B · agent signs elsewhere</p>
              <p className="text-sm text-ink-2">
                Give this typed data to the agent&apos;s signer (for example <code>cast wallet sign --data</code>) and paste
                the signature below.
              </p>
              <Button variant="secondary" onClick={() => downloadJson(`agent-${snap.agentId}-wallet-proof.json`, JSON.parse(typedJson))}>
                Download typed data
              </Button>
            </div>
          </div>
          <Field label="Signature">
            <input className={`${inputCls} hash`} value={signature} onChange={(e) => setSignature(e.target.value.trim())} placeholder="0x…" />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={submit} disabled={!!busy || !signature || left <= 0}>
              {busy && busy !== "Sign in your wallet" ? busy : sameAddr(w.account, owner) ? "Bind wallet" : "Switch to owner to submit"}
            </Button>
            <Button variant="secondary" onClick={() => setPrepared(null)} disabled={!!busy}>
              Start over
            </Button>
          </div>
        </div>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

// ------------------------------------------------------------------ step 3

type ProviderForm = { origin: string; beneficiary: string; contract: string; selectors: string; maxCharge: string; ttl: string };

function PolicyStep({ owner, agentId, onApproved }: { owner: Address; agentId: bigint; onApproved: (policy: unknown, digest: Hex) => void }) {
  const w = useWallet();
  const [mode, setMode] = useState<"none" | "custom">("none");
  const [asset, setAsset] = useState(0);
  const [resource, setResource] = useState("inference");
  const [unit, setUnit] = useState("credits");
  const [threshold, setThreshold] = useState("0");
  const [refill, setRefill] = useState("0");
  const [cap, setCap] = useState("0");
  const [floor, setFloor] = useState("0");
  const [prov, setProv] = useState<ProviderForm>({ origin: "", beneficiary: "", contract: "", selectors: "", maxCharge: "0", ttl: "60" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const a = ASSETS[asset];

  const build = (): { body: ReturnType<typeof policyBody>; digest: Hex } => {
    let assets: PolicyAsset[];
    if (mode === "none") {
      // The A.3 schema needs one asset and one provider even when nothing may be spent.
      // Every cap is zero and the provider is a placeholder no signer can pay.
      assets = [
        {
          network: "eip155:56",
          asset: a.address,
          decimals: a.decimals,
          resource: "none",
          resource_unit: "none",
          balance_threshold: "0",
          refill_amount: "0",
          daily_spend_cap: "0",
          balance_floor: "0",
          provider_allowlist: [
            {
              origin: "https://no-provider.invalid",
              beneficiary: "0x0000000000000000000000000000000000000000",
              contract: "0x0000000000000000000000000000000000000000",
              selectors: ["0x00000000"],
              max_charge: "0",
              quote_ttl_seconds: 1,
            },
          ],
        },
      ];
    } else {
      if (!/^https:\/\/[^/\s?#]+$/.test(prov.origin.trim())) throw new Error("Provider origin must be https://host without a path.");
      if (!isAddress(prov.beneficiary) || !isAddress(prov.contract)) throw new Error("Beneficiary and contract must be addresses.");
      const selectors = prov.selectors
        .split(/[\s,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (!selectors.length || !selectors.every((s) => /^0x[0-9a-f]{8}$/.test(s))) throw new Error("Selectors look like 0xa9059cbb, separated by commas.");
      const ttl = Number(prov.ttl);
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > 300) throw new Error("Quote lifetime must be 1 to 300 seconds.");
      assets = [
        {
          network: "eip155:56",
          asset: a.address,
          decimals: a.decimals,
          resource: resource.trim(),
          resource_unit: unit.trim(),
          balance_threshold: toUnits(threshold, 0),
          refill_amount: toUnits(refill, a.decimals),
          daily_spend_cap: toUnits(cap, a.decimals),
          balance_floor: toUnits(floor, a.decimals),
          provider_allowlist: [
            {
              origin: prov.origin.trim(),
              beneficiary: getAddress(prov.beneficiary),
              contract: getAddress(prov.contract),
              selectors: [...new Set(selectors)],
              max_charge: toUnits(prov.maxCharge, a.decimals),
              quote_ttl_seconds: ttl,
            },
          ],
        },
      ];
    }
    const body = policyBody(agentId, owner, 1n, assets);
    return { body, digest: alpDigest(body) };
  };

  const approve = async () => {
    setError(null);
    try {
      const { body, digest } = build();
      if (!LIFECYCLE_REGISTRY) throw new Error("Registry not deployed.");
      if (!sameAddr(w.account, owner)) throw new Error("Switch back to the owner wallet.");
      setBusy("Sign in your wallet");
      const sig = await w.client().signTypedData({ account: owner, ...policyApprovalTypedData(LIFECYCLE_REGISTRY, agentId, digest, 1n) });
      const full = { ...body, owner_approval: sig };
      const check = validateRecord("A3", full);
      if (!check.ok) throw new Error(`Policy does not match the ALP schema: ${check.errors.join("; ")}`);
      downloadJson(`agent-${agentId}-policy-v1.json`, full);
      onApproved(full, digest);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ink-2">
        ALP requires the owner to approve, in writing, what the agent may spend. Only a hash of the policy goes on chain;
        you keep the signed file. The agent&apos;s signer is what actually enforces it, so give the same file to whoever runs
        the agent.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant={mode === "none" ? "primary" : "secondary"} onClick={() => setMode("none")}>
          No spending yet
        </Button>
        <Button variant={mode === "custom" ? "primary" : "secondary"} onClick={() => setMode("custom")}>
          Set limits and a provider
        </Button>
      </div>
      {mode === "none" ? (
        <Notice>
          Every cap is zero. The agent can be registered and verified, but its signer must refuse every payment. To activate
          later, approve a real policy and re-bind it from the passport.
        </Notice>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Asset">
            <select className={inputCls} value={asset} onChange={(e) => setAsset(Number(e.target.value))}>
              {ASSETS.map((x, i) => (
                <option key={x.address} value={i}>
                  {x.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Resource and unit" hint="What the agent buys, e.g. inference credits.">
            <div className="flex gap-2">
              <input className={inputCls} value={resource} onChange={(e) => setResource(e.target.value)} />
              <input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </Field>
          <Field label="Rolling 24h spending cap" hint={`In ${a.label.split(" ")[0]}.`}>
            <input className={inputCls} value={cap} onChange={(e) => setCap(e.target.value)} />
          </Field>
          <Field label="Refill amount" hint="Spent per top-up.">
            <input className={inputCls} value={refill} onChange={(e) => setRefill(e.target.value)} />
          </Field>
          <Field label="Refill when credits fall below" hint="In provider credit units.">
            <input className={inputCls} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </Field>
          <Field label="Never go below this balance">
            <input className={inputCls} value={floor} onChange={(e) => setFloor(e.target.value)} />
          </Field>
          <div className="space-y-4 rounded-lg border border-rule p-4 sm:col-span-2">
            <p className="text-sm font-medium text-ink">Allowed provider</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Origin">
                <input className={inputCls} value={prov.origin} onChange={(e) => setProv({ ...prov, origin: e.target.value })} placeholder="https://provider.example" />
              </Field>
              <Field label="Beneficiary (payee)">
                <input className={`${inputCls} hash`} value={prov.beneficiary} onChange={(e) => setProv({ ...prov, beneficiary: e.target.value.trim() })} />
              </Field>
              <Field label="Contract called">
                <input className={`${inputCls} hash`} value={prov.contract} onChange={(e) => setProv({ ...prov, contract: e.target.value.trim() })} />
              </Field>
              <Field label="Allowed methods" hint="4-byte selectors, comma separated.">
                <input className={`${inputCls} hash`} value={prov.selectors} onChange={(e) => setProv({ ...prov, selectors: e.target.value })} placeholder="0xa9059cbb" />
              </Field>
              <Field label="Maximum charge per quote">
                <input className={inputCls} value={prov.maxCharge} onChange={(e) => setProv({ ...prov, maxCharge: e.target.value })} />
              </Field>
              <Field label="Quote lifetime (seconds)" hint="1 to 300.">
                <input className={inputCls} value={prov.ttl} onChange={(e) => setProv({ ...prov, ttl: e.target.value.replace(/\D/g, "") })} />
              </Field>
            </div>
          </div>
        </div>
      )}
      <Button onClick={approve} disabled={!!busy}>
        {busy ?? "Sign and download policy"}
      </Button>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

// ------------------------------------------------------------------ step 4

function RecordStep({ owner, snap, journal, onRecorded }: { owner: Address; snap: AgentSnapshot; journal: Journal; onRecorded: (tx: Hex) => Promise<void> }) {
  const w = useWallet();
  const [controller, setController] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctlOk = isAddress(controller) && !sameAddr(controller as Address, snap.wallet);

  const summary = useMemo(
    () => [
      ["Owner", owner],
      ["Agent wallet", snap.wallet ?? "—"],
      ["Policy digest", journal.policyDigest ?? "—"],
    ],
    [owner, snap.wallet, journal.policyDigest],
  );

  const issue = async () => {
    setError(null);
    try {
      if (!LIFECYCLE_REGISTRY || !journal.policyDigest) throw new Error("Missing policy.");
      if (!sameAddr(w.account, owner)) throw new Error("Switch back to the owner wallet.");
      const operationId = newOperationId("register", snap.agentId);
      const doc = evidenceDocument({
        agentId: snap.agentId,
        from: "PROVISIONED",
        to: "REGISTERED",
        operationId,
        note: "Identity registered, dedicated wallet bound by EIP-712 proof and read back, policy approved by owner.",
        links: [journal.registerTx, journal.walletTx].filter(Boolean) as string[],
        actor: owner,
      });
      const evidence = alpDigest(doc);
      const record = { evidence_digest: evidence, operation_id: operationId, document: doc, policy_digest: journal.policyDigest };
      downloadJson(`agent-${snap.agentId}-registration-evidence.json`, record);
      await w.ensureChain();
      setBusy("Confirm in your wallet");
      const rec = await sendAndWait(
        w.client(),
        {
          address: LIFECYCLE_REGISTRY,
          abi: lifecycleAbi,
          functionName: "register",
          args: [snap.agentId, getAddress(controller), journal.policyDigest, evidence, operationKey(operationId)],
        },
        () => setBusy("Waiting for the block"),
      );
      await onRecorded(rec.transactionHash);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ink-2">
        The controller is the service that activates and suspends the agent: usually the runtime host or a small ops key
        you control. It can never change the owner, the wallet or the policy, and it is frozen to suspend-only if the
        identity is sold. You can be your own controller.
      </p>
      <dl className="space-y-1 text-sm">
        {summary.map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-x-3">
            <dt className="w-28 text-muted">{k}</dt>
            <dd className="hash">{v}</dd>
          </div>
        ))}
      </dl>
      <Field label="Controller address" hint="Any address except the agent wallet.">
        <div className="flex gap-2">
          <input className={`${inputCls} hash`} value={controller} onChange={(e) => setController(e.target.value.trim())} placeholder="0x…" />
          <Button variant="secondary" onClick={() => setController(owner)}>
            Use owner
          </Button>
        </div>
      </Field>
      <Button onClick={issue} disabled={!ctlOk || !!busy}>
        {busy ?? "Issue passport"}
      </Button>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}
