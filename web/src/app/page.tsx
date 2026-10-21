import Link from "next/link";
import { Stamp } from "@/components/stamp";
import { AgentLookup, LiveCount, RecentPassports } from "@/components/home-islands";
import { TokenSlot } from "@/components/token-slot";
import { EXPLORER, LIFECYCLE_REGISTRY } from "@/lib/config";

const RING = "BAP-728 · BNB SMART CHAIN";

const STAMPS = [
  { state: "REGISTERED" as const, line: "Identity and wallet proven", rot: -8 },
  { state: "ACTIVE" as const, line: "Cleared to work and get paid", rot: 5 },
  { state: "SUSPENDED" as const, line: "Paused. Do not pay it", rot: -4 },
  { state: "RETIRED" as const, line: "Gone for good. No way back", rot: 7 },
];

const ROADMAP = [
  { title: "Identity + lifecycle", body: "Who owns the agent, which wallet it uses, and if it may work.", status: "Live on Stamp", live: true },
  { title: "Self-paying agents", body: "Agents buy their own compute with x402, inside limits the owner signed.", status: "In BAP-728 · next", live: false },
  { title: "Agent jobs + escrow", body: "Agents take paid jobs through ERC-8183 escrow, settled on chain.", status: "In BAP-728 · next", live: false },
  { title: "Portable agents", body: "Move an agent between hosts without two copies spending one wallet.", status: "In BAP-728 · later", live: false },
];

export default function Home() {
  return (
    <>
      {/* HERO: the standard's name is the headline */}
      <section className="relative overflow-hidden border-b border-rule">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 md:grid-cols-[1.25fr_1fr] md:pt-20 md:pb-24">
          <div>
            <a
              href="https://github.com/bnb-chain/BEPs/blob/master/BAPs/BAP-728.md"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-registered/50 px-3 py-1 text-xs font-medium tracking-wide text-registered uppercase hover:border-registered"
            >
              New BNB Chain proposal · read it
              <span aria-hidden>↗</span>
            </a>
            <h1 className="mt-6 font-serif leading-[0.85] tracking-tight text-ink">
              <span className="block text-[5.5rem] sm:text-[8rem] md:text-[9.5rem]">BAP-728</span>
              <span className="mt-4 block text-3xl leading-tight text-ink-2 sm:text-[2.6rem]">
                The passport for AI agents on BNB Chain.
              </span>
            </h1>
            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-ink">
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-active" aria-hidden />
                Live on BSC mainnet
              </span>
              <span className="text-muted">·</span>
              <LiveCount />
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/register" className="rounded-full bg-ink px-6 py-3 text-base font-medium text-paper hover:opacity-90">
                Get your agent stamped
              </Link>
              <Link href="/verify" className="rounded-full border border-rule-strong px-6 py-3 text-base font-medium text-ink hover:border-ink">
                Check an agent
              </Link>
            </div>
          </div>
          <div className="relative mx-auto h-[300px] w-[300px] sm:h-[400px] sm:w-[400px]" aria-hidden>
            <div className="absolute inset-0 grid place-items-center">
              <Stamp state="ACTIVE" agentId="" sequence="" size={310} rotate={-9} topText={RING} bottomText="AI AGENT PASSPORT" animate />
            </div>
            <div className="absolute -right-4 -bottom-6 sm:-right-10 sm:-bottom-8">
              <Stamp state="REGISTERED" agentId="" sequence="" size={120} rotate={12} topText={RING} bottomText="ERC-8004" />
            </div>
          </div>
        </div>
      </section>

      {/* WHAT IT IS, IN ONE LINE */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <p className="mx-auto max-w-3xl font-serif text-3xl leading-snug text-ink sm:text-[2.6rem]">
          Before you pay an AI agent, check its passport.
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-2">Who owns it. Which wallet it uses. Whether it is allowed to work. On chain, for everyone.</p>
      </section>

      {/* THE FOUR STAMPS */}
      <section className="border-y border-rule bg-card/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-sm font-medium tracking-[0.2em] text-muted uppercase">Every agent carries one of four stamps</h2>
          <ul className="mt-10 grid grid-cols-2 gap-y-10 md:grid-cols-4">
            {STAMPS.map((s) => (
              <li key={s.state} className="flex flex-col items-center text-center">
                <Stamp state={s.state} agentId="" sequence="" size={150} rotate={s.rot} topText={RING} bottomText="LIFECYCLE STAMP" />
                <p className="mt-4 max-w-[12rem] text-sm text-ink-2">{s.line}</p>
              </li>
            ))}
          </ul>
          <p className="mt-10 text-center text-sm text-muted">Retired is permanent. Not even we can undo it.</p>
        </div>
      </section>

      {/* HOW: three steps, big numbers */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="font-serif text-4xl tracking-tight sm:text-5xl">Stamped in 3 steps</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            ["Register", "Give your agent an ERC-8004 identity."],
            ["Prove the wallet", "The agent signs to claim its own wallet."],
            ["Get stamped", "Your passport goes on chain. A few cents of gas."],
          ].map(([t, b], i) => (
            <li key={t} className="rounded-2xl border border-rule bg-card p-6">
              <span className="font-serif text-6xl leading-none text-registered">{i + 1}</span>
              <h3 className="mt-4 text-lg font-medium text-ink">{t}</h3>
              <p className="mt-1 text-ink-2">{b}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8">
          <Link href="/register" className="text-base font-medium text-ink underline underline-offset-4">
            Start now
          </Link>
        </div>
      </section>

      {/* WHERE BAP-728 GOES */}
      <section className="border-y border-rule bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="text-sm font-medium tracking-[0.2em] text-paper/60 uppercase">Where BAP-728 is going</p>
          <h2 className="mt-3 max-w-3xl font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            Agents that own wallets, pay their own bills and take paid jobs.
          </h2>
          <p className="mt-4 max-w-2xl text-paper/70">The passport comes first. Everything else in the standard builds on it.</p>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-paper/15 md:grid-cols-4">
            {ROADMAP.map((r) => (
              <li key={r.title} className="bg-ink p-6">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${r.live ? "bg-active text-paper" : "border border-paper/30 text-paper/70"}`}
                >
                  {r.status}
                </span>
                <h3 className="mt-4 text-lg font-medium">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-paper/70">{r.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* LIVE PASSPORTS */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-serif text-4xl tracking-tight sm:text-5xl">Latest passports</h2>
          <AgentLookup />
        </div>
        <div className="mt-8">
          <RecentPassports />
        </div>
      </section>

      <TokenSlot />

      {/* PROOF, small */}
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <div className="flex flex-col gap-3 border-t border-rule pt-8 text-sm text-muted md:flex-row md:items-center md:justify-between">
          <p>
            Contract{" "}
            {LIFECYCLE_REGISTRY ? (
              <a href={`${EXPLORER}/address/${LIFECYCLE_REGISTRY}`} target="_blank" rel="noreferrer" className="hash text-ink underline underline-offset-2">
                {LIFECYCLE_REGISTRY}
              </a>
            ) : (
              "not deployed"
            )}{" "}
            · no admin, no upgrades · source verified
          </p>
          <p>
            A passport proves identity, not quality.{" "}
            <Link href="/docs" className="text-ink underline underline-offset-2">
              How it works
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
