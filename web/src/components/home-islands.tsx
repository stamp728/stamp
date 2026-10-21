"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readAgent, readDirectory, type AgentSnapshot } from "@/lib/chain";
import { LIFECYCLE_REGISTRY } from "@/lib/config";
import { decodeDataUri, shortHex } from "@/lib/alp";
import { StateBadge } from "./stamp";
import { Spinner, inputCls } from "./ui";

export function AgentLookup() {
  const router = useRouter();
  const [v, setV] = useState("");
  const valid = /^\d{1,78}$/.test(v.trim());
  return (
    <form
      className="flex w-full max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/agent/${v.trim()}`);
      }}
    >
      <label className="sr-only" htmlFor="lookup">
        ERC-8004 agent ID
      </label>
      <input
        id="lookup"
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))}
        placeholder="ERC-8004 agent ID"
        className={inputCls}
      />
      <button
        type="submit"
        disabled={!valid}
        className="shrink-0 rounded-lg border border-ink px-4 text-sm font-medium text-ink hover:bg-ink hover:text-paper disabled:opacity-40"
      >
        Look up
      </button>
    </form>
  );
}

export type DirectoryItem = { id: bigint; snap: AgentSnapshot; name: string | null };

export function nameOf(snap: AgentSnapshot): string | null {
  if (!snap.tokenURI) return null;
  try {
    const f = decodeDataUri(snap.tokenURI) as { name?: unknown } | null;
    return f && typeof f.name === "string" ? f.name.slice(0, 80) : null;
  } catch {
    return null;
  }
}

export function useDirectory(start: number, count: number, newestFirst = true) {
  const [items, setItems] = useState<DirectoryItem[] | null>(null);
  const [total, setTotal] = useState<bigint>(0n);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        if (!LIFECYCLE_REGISTRY) {
          setItems([]);
          return;
        }
        const first = await readDirectory(0, 0);
        const n = Number(first.total);
        setTotal(first.total);
        const from = newestFirst ? Math.max(0, n - start - count) : start;
        const len = newestFirst ? Math.min(count, Math.max(0, n - start)) : count;
        const { ids } = await readDirectory(from, len);
        const ordered = newestFirst ? [...ids].reverse() : ids;
        const snaps = await Promise.all(ordered.map((id) => readAgent(id)));
        if (!dead) setItems(ordered.map((id, i) => ({ id, snap: snaps[i], name: nameOf(snaps[i]) })));
      } catch (e) {
        if (!dead) setErr((e as Error).message);
      }
    })();
    return () => {
      dead = true;
    };
  }, [start, count, newestFirst]);
  return { items, total, err };
}

export function PassportList({ items }: { items: DirectoryItem[] }) {
  return (
    <ul className="divide-y divide-rule rounded-xl border border-rule bg-card">
      {items.map(({ id, snap, name }) => (
        <li key={id.toString()}>
          <Link href={`/agent/${id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-paper-2/60">
            <span className="hash w-20 text-muted">#{id.toString()}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{name ?? <span className="text-muted">Unnamed agent</span>}</span>
            {snap.record ? <StateBadge state={snap.record.state} /> : null}
            {snap.live && snap.record && snap.record.state !== "RETIRED" && !(snap.live.ownerMatches && snap.live.walletMatches) ? (
              <span className="text-xs text-suspended">binding changed</span>
            ) : null}
            <span className="hash hidden text-muted sm:inline">{snap.owner ? shortHex(snap.owner, 4) : ""}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RecentPassports() {
  const { items, total, err } = useDirectory(0, 6);
  if (!LIFECYCLE_REGISTRY)
    return <p className="text-sm text-muted">The lifecycle registry is not deployed yet. Passports will appear here as soon as it is.</p>;
  if (err) return <p className="text-sm text-retired">Could not read the chain right now: {err}</p>;
  if (!items) return <Spinner label="Reading the registry on BNB Smart Chain" />;
  if (items.length === 0) return <p className="text-sm text-muted">No passports yet. The first one could be yours.</p>;
  return (
    <div className="space-y-3">
      <PassportList items={items} />
      <p className="text-sm text-muted">
        {total.toString()} passport{total === 1n ? "" : "s"} on record.{" "}
        <Link href="/agents" className="text-ink underline underline-offset-2">
          See all
        </Link>
      </p>
    </div>
  );
}

/** Number of passports, read from the contract. */
export function LiveCount() {
  const [n, setN] = useState<bigint | null>(null);
  useEffect(() => {
    let dead = false;
    const run = (tries: number) =>
      readDirectory(0, 0)
        .then((d) => !dead && setN(d.total))
        .catch((e) => {
          console.warn("passport count", e);
          if (tries > 0 && !dead) setTimeout(() => run(tries - 1), 1500);
        });
    run(3);
    return () => {
      dead = true;
    };
  }, []);
  if (n === null) return <span className="text-muted">reading the chain…</span>;
  return (
    <span>
      <span className="font-medium">{n.toString()}</span> passport{n === 1n ? "" : "s"} issued
    </span>
  );
}
