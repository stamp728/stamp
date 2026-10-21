"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { VerifyReport } from "@/lib/verify";
import { Button, CheckList, Notice, Spinner, inputCls } from "./ui";

const VERDICT: Record<VerifyReport["verdict"], { word: string; color: string }> = {
  verified: { word: "Verified and active", color: "var(--active)" },
  "verified-not-active": { word: "Verified, not active", color: "var(--registered)" },
  failed: { word: "Failed", color: "var(--retired)" },
  "no-passport": { word: "No passport", color: "var(--muted)" },
};

export function Verifier({ preset }: { preset?: string }) {
  const [id, setId] = useState(preset ?? "");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (agentId = id) => {
    if (!agentId) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setReport(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (preset) run(preset); // eslint-disable-line react-hooks/exhaustive-deps
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-8">
      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label htmlFor="vid" className="sr-only">
          Agent ID
        </label>
        <input id="vid" className={inputCls} inputMode="numeric" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} placeholder="ERC-8004 agent ID" />
        <Button type="submit" disabled={!id || busy}>
          {busy ? "Checking" : "Verify"}
        </Button>
      </form>
      {busy ? <Spinner label="Reading the chain, fetching the descriptor and sending a fresh handshake" /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {report ? (
        <section className="space-y-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h2 className="font-serif text-4xl" style={{ color: VERDICT[report.verdict].color }}>
              {VERDICT[report.verdict].word}
            </h2>
            <Link href={`/agent/${report.agentId}`} className="text-sm underline underline-offset-4">
              Agent #{report.agentId}
            </Link>
            <span className="hash text-muted">block {report.block}</span>
          </div>
          <p className="max-w-2xl text-ink-2">{report.summary}</p>
          <div className="rounded-xl border border-rule bg-card px-4">
            <CheckList checks={report.checks} />
          </div>
          {report.handshake ? (
            <details className="rounded-xl border border-rule bg-card p-4">
              <summary className="cursor-pointer text-sm font-medium">Raw descriptor and handshake</summary>
              <pre className="hash mt-3 overflow-x-auto text-xs whitespace-pre-wrap">{JSON.stringify({ descriptor: report.descriptor, handshake: report.handshake }, null, 2)}</pre>
            </details>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
