"use client";

import { useState, type ReactNode } from "react";
import { EXPLORER } from "@/lib/config";
import { shortHex } from "@/lib/alp";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-paper-2 hover:text-ink"
      aria-label={`${label} ${value}`}
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function Addr({ value, kind = "address", full = false }: { value: string; kind?: "address" | "tx" | "block"; full?: boolean }) {
  const href = `${EXPLORER}/${kind}/${value}`;
  return (
    <span className="inline-flex max-w-full items-center gap-1 align-middle">
      <a href={href} target="_blank" rel="noreferrer" className="hash text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
        {full ? value : shortHex(value, 6)}
      </a>
      {kind !== "block" ? <CopyButton value={value} /> : null}
    </span>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-rule py-3 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">
        {label}
        {hint ? <span className="block text-xs text-muted/80">{hint}</span> : null}
      </dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );
}

export type CheckResult = { id: string; label: string; status: "pass" | "fail" | "warn" | "skip"; detail: string; ref?: string };

const MARK: Record<CheckResult["status"], { glyph: string; color: string; word: string }> = {
  pass: { glyph: "✓", color: "var(--active)", word: "Pass" },
  fail: { glyph: "✕", color: "var(--retired)", word: "Fail" },
  warn: { glyph: "!", color: "var(--suspended)", word: "Attention" },
  skip: { glyph: "–", color: "var(--muted)", word: "Not checked" },
};

export function CheckList({ checks }: { checks: CheckResult[] }) {
  return (
    <ul className="divide-y divide-rule">
      {checks.map((c) => {
        const m = MARK[c.status];
        return (
          <li key={c.id} className="flex gap-3 py-3">
            <span
              className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold"
              style={{ color: m.color, borderColor: m.color }}
              aria-label={m.word}
            >
              {m.glyph}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-ink">
                {c.label}
                {c.ref ? <span className="ml-2 hash text-[11px] text-muted">{c.ref}</span> : null}
              </p>
              <p className="mt-0.5 text-sm text-muted [overflow-wrap:anywhere]">{c.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const color = tone === "warn" ? "var(--suspended)" : tone === "error" ? "var(--retired)" : tone === "ok" ? "var(--active)" : "var(--ink-2)";
  return (
    <div className="rounded-lg border-l-2 bg-card px-4 py-3 text-sm leading-relaxed text-ink-2" style={{ borderColor: color }}>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}) {
  const cls =
    variant === "primary"
      ? "bg-ink text-paper hover:opacity-90"
      : variant === "danger"
        ? "border border-retired text-retired hover:bg-retired hover:text-paper"
        : "border border-rule-strong text-ink hover:border-ink";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span> : null}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-rule bg-card px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none";
