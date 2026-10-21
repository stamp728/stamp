"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/docs", label: "How Stamp works" },
  { href: "/docs/builders", label: "For agent builders" },
  { href: "/docs/contract", label: "Contract reference" },
  { href: "/docs/conformance", label: "Conformance" },
  { href: "/docs/security", label: "Security and trust" },
];

export function DocsNav(props: { static?: boolean }) {
  return props.static ? <Links path="" /> : <LiveLinks />;
}

function LiveLinks() {
  return <Links path={usePathname()} />;
}

function Links({ path }: { path: string }) {
  return (
    <nav aria-label="Documentation" className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.map((i) => {
        const on = path === i.href;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-2 text-sm ${on ? "bg-card text-ink shadow-[inset_2px_0_0_var(--ink)]" : "text-muted hover:text-ink"}`}
          >
            {i.label}
          </Link>
        );
      })}
      <a href="/binding/manifest.json" className="shrink-0 rounded-md px-3 py-2 text-sm text-muted hover:text-ink">
        Manifest (JSON)
      </a>
    </nav>
  );
}
