"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { readAgent, readHistory, type AgentSnapshot, type StampEvent } from "@/lib/chain";
import { AGENT_REGISTRY, decodeDataUri, shortHex } from "@/lib/alp";
import { scanUpstreamChanges, snapshotChecks } from "@/lib/checks";
import { LIFECYCLE_REGISTRY, NETWORK_LABEL } from "@/lib/config";
import { Stamp, StateBadge } from "./stamp";
import { Addr, CheckList, Notice, Row, Spinner, type CheckResult } from "./ui";
import { ManagePanel } from "./manage";

type Loaded = { snap: AgentSnapshot; file: unknown; fileError: string | null; history: StampEvent[] };

export function fmtDate(ts: bigint) {
  return new Date(Number(ts) * 1000)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

async function loadRegistrationFile(uri: string | null): Promise<{ file: unknown; error: string | null }> {
  if (!uri) return { file: null, error: "No agent URI set." };
  try {
    const inline = decodeDataUri(uri);
    if (inline) return { file: inline, error: null };
    const res = await fetch(`/api/registration?uri=${encodeURIComponent(uri)}`);
    const body = await res.json();
    if (!res.ok) return { file: null, error: body.error ?? `HTTP ${res.status}` };
    return { file: body.file, error: null };
  } catch (e) {
    return { file: null, error: (e as Error).message };
  }
}

export function Passport({ agentId }: { agentId: string }) {
  const id = BigInt(agentId);
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [upstream, setUpstream] = useState<CheckResult | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const snap = await readAgent(id);
        const [{ file, error }, history] = await Promise.all([
          loadRegistrationFile(snap.tokenURI),
          snap.record ? readHistory(id, snap.record.updatedAtBlock) : Promise.resolve([]),
        ]);
        if (dead) return;
        setData({ snap, file, fileError: error, history });
        if (snap.record && !snap.record.retired) {
          setUpstream(null);
          scanUpstreamChanges(id, snap.record.updatedAtBlock, snap.blockNumber, 50_000n)
            .then((s) => {
              if (dead) return;
              const changed = s.transfers + s.walletChanges;
              setUpstream({
                id: "upstream",
                label: "No transfer or wallet change since the last record",
                status: changed > 0 ? "fail" : s.complete ? "pass" : "warn",
                detail:
                  changed > 0
                    ? `${s.transfers} transfer(s) and ${s.walletChanges} wallet change(s) on the identity since block ${snap.record!.updatedAtBlock}. Even if the values look the same now, sessions and delegations must be treated as invalid until the owner re-binds.`
                    : s.complete
                      ? `Scanned every block since ${snap.record!.updatedAtBlock}.`
                      : `Scanned the last 50,000 blocks only. The full check runs on the Verify page.`,
                ref: "BAP-728 4.3",
              });
            })
            .catch(() => {
              if (!dead)
                setUpstream({ id: "upstream", label: "Transfer history", status: "skip", detail: "The log RPC did not answer. Try Verify." });
            });
        }
      } catch (e) {
        if (!dead) setErr((e as Error).message);
      }
    })();
    return () => {
      dead = true;
    };
  }, [agentId, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err)
    return (
      <Notice tone="error">
        Could not read BNB Smart Chain right now: {err}. <button className="underline" onClick={refresh}>Try again</button>
      </Notice>
    );
  if (!data) return <Spinner label={`Reading agent #${agentId} from BNB Smart Chain`} />;

  const { snap, file, fileError, history } = data;
  const reg = (file ?? {}) as { name?: string; description?: string; image?: string; services?: { name: string; endpoint: string }[] };
  const name = typeof reg.name === "string" && reg.name ? reg.name : `Agent #${agentId}`;
  const r = snap.record;
  const checks = snapshotChecks(snap, file);
  if (upstream) checks.splice(checks.findIndex((c) => c.id === "dedicated"), 0, upstream);
  const latest = history[0];

  if (!snap.exists) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="font-serif text-4xl">No agent #{agentId}</h1>
        <p className="text-ink-2">
          The ERC-8004 identity registry on BNB Smart Chain has no agent with this ID. Check the number, or{" "}
          <Link className="underline" href="/register">register a new agent</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <article className="overflow-hidden rounded-2xl border border-rule-strong bg-card shadow-[0_1px_0_var(--rule),0_24px_48px_-32px_rgba(22,32,58,0.35)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-paper-2/70 px-5 py-3 sm:px-8">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">Agent passport · {NETWORK_LABEL}</p>
          {r ? <StateBadge state={r.state} /> : <span className="text-xs text-muted uppercase">No lifecycle record</span>}
        </header>
        <div className="grid gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="flex items-start gap-4">
              {reg.image && /^https:\/\//.test(reg.image) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={reg.image} alt="" className="size-16 shrink-0 rounded-xl border border-rule object-cover" />
              ) : null}
              <div className="min-w-0">
                <h1 className="font-serif text-4xl leading-tight break-words text-ink sm:text-5xl">{name}</h1>
                <p className="hash mt-1 text-muted">
                  #{agentId} · {AGENT_REGISTRY}
                </p>
              </div>
            </div>
            {reg.description ? <p className="mt-5 max-w-2xl leading-relaxed whitespace-pre-line text-ink-2">{reg.description}</p> : null}
            {fileError ? <p className="mt-3 text-sm text-suspended">Registration file: {fileError}</p> : null}

            <dl className="mt-8">
              <Row label="Owner" hint="Holds the ERC-8004 token">
                {snap.owner ? <Addr value={snap.owner} /> : "—"}
              </Row>
              <Row label="Agent wallet" hint="Signature-verified">
                {snap.wallet ? <Addr value={snap.wallet} /> : <span className="text-suspended">Not set</span>}
              </Row>
              {r ? (
                <>
                  <Row label="Controller" hint="Activates and suspends">
                    <Addr value={r.controller} />
                  </Row>
                  <Row label="Sequence · epoch">
                    <span className="hash">
                      {r.sequence.toString()} · {r.authorityEpoch.toString()}
                    </span>
                  </Row>
                  <Row label="Policy digest" hint="Owner-approved spending policy">
                    <span className="hash">{r.policyDigest}</span>
                  </Row>
                  <Row label="Last evidence">
                    <span className="hash">{r.evidence}</span>
                  </Row>
                </>
              ) : null}
              {reg.services?.length ? (
                <Row label="Services">
                  <ul className="space-y-1">
                    {reg.services.slice(0, 8).map((s, i) => (
                      <li key={i} className="flex flex-wrap gap-x-2">
                        <span className="text-muted">{String(s.name)}</span>
                        <span className="hash break-all">{String(s.endpoint)}</span>
                      </li>
                    ))}
                  </ul>
                </Row>
              ) : null}
            </dl>
          </div>
          <div className="flex flex-col items-center gap-3 lg:pt-4">
            {r && latest ? (
              <Stamp
                state={r.state}
                agentId={agentId}
                sequence={r.sequence.toString()}
                block={latest.blockNumber.toString()}
                date={fmtDate(latest.timestamp)}
                size={220}
                rotate={-7}
                animate
              />
            ) : (
              <div className="grid size-[220px] place-items-center rounded-full border-2 border-dashed border-rule-strong p-8 text-center text-sm text-muted">
                No stamp yet
              </div>
            )}
            {snap.live && r && !r.retired && !snap.live.operational && r.state === "ACTIVE" ? (
              <p className="max-w-[220px] text-center text-xs text-suspended">Binding changed after this stamp. Treat as suspended.</p>
            ) : null}
          </div>
        </div>
      </article>

      {!r ? (
        <Notice tone="warn">
          This agent has an ERC-8004 identity but no lifecycle record, so nobody can tell whether it is allowed to work. The
          owner can{" "}
          <Link className="underline" href={`/register?agent=${agentId}`}>
            issue the passport
          </Link>{" "}
          in two steps.
        </Notice>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <section>
          <h2 className="font-serif text-3xl">Live checks</h2>
          <p className="mt-2 text-sm text-muted">
            Read from block {snap.blockNumber.toString()} just now. For the signed identity handshake, use{" "}
            <Link className="underline" href={`/verify?agent=${agentId}`}>
              Verify
            </Link>
            .
          </p>
          <div className="mt-4 rounded-xl border border-rule bg-card px-4">
            <CheckList checks={checks} />
          </div>
        </section>
        <section>
          <h2 className="font-serif text-3xl">Manage</h2>
          <p className="mt-2 text-sm text-muted">The owner and the controller see their actions here after connecting.</p>
          <div className="mt-4">
            {LIFECYCLE_REGISTRY ? <ManagePanel snap={snap} onDone={refresh} /> : <Notice>The lifecycle registry is not deployed yet.</Notice>}
          </div>
        </section>
      </div>

      {history.length ? (
        <section>
          <h2 className="font-serif text-3xl">Stamps</h2>
          <p className="mt-2 text-sm text-muted">Every change to this record, newest first. Each one is a transaction you can open.</p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {history.map((h) => (
              <li key={`${h.txHash}-${h.sequence}`} className="rounded-xl border border-rule bg-card p-4">
                <div className="flex justify-center py-2">
                  <Stamp
                    state={h.to}
                    agentId={agentId}
                    sequence={h.sequence.toString()}
                    block={h.blockNumber.toString()}
                    date={fmtDate(h.timestamp)}
                    size={150}
                    rotate={Number(h.sequence % 5n) * 3 - 6}
                    rebind={h.rebind}
                  />
                </div>
                <dl className="mt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Change</dt>
                    <dd className="text-ink">{h.rebind ? `Authority re-bound (${h.to})` : h.from === "NONE" ? "Record opened" : `${h.from} → ${h.to}`}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">By</dt>
                    <dd>
                      <Addr value={h.actor} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Transaction</dt>
                    <dd>
                      <Addr value={h.txHash} kind="tx" />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Evidence</dt>
                    <dd className="hash" title={h.evidence}>
                      {shortHex(h.evidence, 6)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Epoch</dt>
                    <dd className="hash">{h.authorityEpoch.toString()}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
