"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { Logo } from "./stamp";
import { errorText, useWallet } from "@/lib/wallet";
import { shortHex } from "@/lib/alp";
import { CHAIN_ID, EXPLORER } from "@/lib/config";

const NAV = [
  { href: "/agents", label: "Agents" },
  { href: "/register", label: "Issue a passport" },
  { href: "/verify", label: "Verify" },
  { href: "/docs", label: "Docs" },
];

function NavLinks({ onNavigate, mobile = false }: { onNavigate?: () => void; mobile?: boolean }) {
  const path = usePathname();
  return (
    <>
      {NAV.map((n) => {
        const on = path === n.href || (n.href !== "/" && path.startsWith(n.href));
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={on ? "page" : undefined}
            className={
              mobile
                ? "block py-2.5 text-base text-ink"
                : `rounded-md px-3 py-2 text-sm transition-colors ${on ? "text-ink" : "text-muted hover:text-ink"}`
            }
          >
            {n.label}
          </Link>
        );
      })}
    </>
  );
}

function StaticLinks({ mobile = false }: { mobile?: boolean }) {
  return (
    <>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={mobile ? "block py-2.5 text-base text-ink" : "rounded-md px-3 py-2 text-sm text-muted"}>
          {n.label}
        </Link>
      ))}
    </>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-ink" onClick={() => setOpen(false)}>
          <Logo size={30} />
          <span className="font-serif text-[1.45rem] leading-none tracking-tight">Stamp</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <Suspense fallback={<StaticLinks />}>
            <NavLinks />
          </Suspense>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ConnectButton />
          <button
            className="rounded-md p-2 text-ink md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open ? (
        <nav className="border-t border-rule px-4 pb-3 md:hidden" aria-label="Mobile">
          <Suspense fallback={<StaticLinks mobile />}>
            <NavLinks mobile onNavigate={() => setOpen(false)} />
          </Suspense>
        </nav>
      ) : null}
    </header>
  );
}

export function ConnectButton({ compact = false }: { compact?: boolean }) {
  const w = useWallet();
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  if (w.account) {
    const wrong = w.chainId !== CHAIN_ID;
    return (
      <div className="flex items-center gap-2">
        {wrong ? (
          <button
            onClick={() => w.ensureChain().catch((e) => setErr(errorText(e)))}
            className="rounded-full border border-suspended px-3 py-1.5 text-xs font-medium text-suspended"
          >
            Switch to BNB Chain
          </button>
        ) : null}
        <button
          onClick={w.disconnect}
          title="Disconnect"
          className="hash rounded-full border border-rule bg-card px-3 py-1.5 text-ink hover:border-rule-strong"
        >
          {shortHex(w.account, 4)}
        </button>
      </div>
    );
  }

  const go = async (i?: number) => {
    setErr(null);
    try {
      await w.connect(i === undefined ? undefined : w.providers[i]);
      await w.ensureChain();
      setPicking(false);
    } catch (e) {
      setErr(errorText(e));
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => (w.providers.length > 1 ? setPicking((v) => !v) : go())}
        className={`rounded-full bg-ink font-medium text-paper hover:opacity-90 ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
      >
        Connect wallet
      </button>
      {picking ? (
        <div className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-rule bg-card p-1.5 shadow-lg">
          {w.providers.map((p, i) => (
            <button
              key={p.info.uuid}
              onClick={() => go(i)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-paper-2"
            >
              {p.info.icon ? <img src={p.info.icon} alt="" className="size-5 rounded" /> : null}
              {p.info.name}
            </button>
          ))}
        </div>
      ) : null}
      {err ? <p className="absolute right-0 mt-2 w-64 rounded-lg bg-card p-2 text-xs text-retired shadow">{err}</p> : null}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-muted sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-ink">
            <Logo size={22} />
            <span className="font-serif text-lg">Stamp</span>
          </div>
          <p className="max-w-sm leading-relaxed">
            An independent implementation of the BAP-728 lifecycle registry for ERC-8004 agents on BNB Smart Chain. Not
            affiliated with BNB Chain. BAP-728 is a draft and may change.
          </p>
        </div>
        <div className="space-y-2">
          <p className="font-medium text-ink">Product</p>
          <Link className="block hover:text-ink" href="/agents">Agent directory</Link>
          <Link className="block hover:text-ink" href="/register">Issue a passport</Link>
          <Link className="block hover:text-ink" href="/verify">Verify an agent</Link>
          <a className="block hover:text-ink" href="/binding/manifest.json">Deployment manifest</a>
        </div>
        <div className="space-y-2">
          <p className="font-medium text-ink">Reference</p>
          <Link className="block hover:text-ink" href="/docs">Documentation</Link>
          <a className="block hover:text-ink" href="https://github.com/bnb-chain/BEPs/blob/master/BAPs/BAP-728.md" target="_blank" rel="noreferrer">BAP-728 proposal</a>
          <a className="block hover:text-ink" href="https://eips.ethereum.org/EIPS/eip-8004" target="_blank" rel="noreferrer">ERC-8004</a>
          <a className="block hover:text-ink" href={EXPLORER} target="_blank" rel="noreferrer">BscScan</a>
        </div>
      </div>
    </footer>
  );
}
