import type { StateName } from "@/lib/alp";
import { TESTNET } from "@/lib/config";

export const STATE_COLOR: Record<StateName, string> = {
  NONE: "var(--muted)",
  DRAFT: "var(--muted)",
  PROVISIONED: "var(--muted)",
  REGISTERED: "var(--registered)",
  ACTIVE: "var(--active)",
  SUSPENDED: "var(--suspended)",
  RETIRED: "var(--retired)",
};

export const STATE_LABEL: Record<StateName, string> = {
  NONE: "Not recorded",
  DRAFT: "Draft",
  PROVISIONED: "Provisioned",
  REGISTERED: "Registered",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  RETIRED: "Retired",
};

/**
 * One lifecycle stamp. Every word on it is data from the chain:
 * state, agent id, sequence, block and date of the transition.
 */
export function Stamp({
  state,
  agentId,
  sequence,
  block,
  date,
  size = 168,
  rotate = -6,
  animate = false,
  rebind = false,
  topText,
  bottomText,
}: {
  state: StateName;
  agentId: string;
  sequence: string;
  block?: string;
  date?: string;
  size?: number;
  rotate?: number;
  animate?: boolean;
  rebind?: boolean;
  /** Overrides for illustrative (non-record) stamps, e.g. the state legend. */
  topText?: string;
  bottomText?: string;
}) {
  const color = STATE_COLOR[state];
  const id = `arc-${agentId}-${sequence}-${state}`;
  const top = topText ?? `AGENT #${agentId} · ${TESTNET ? "BSC TESTNET" : "BNB SMART CHAIN"}`;
  const bottom = bottomText ?? (block ? `SEQ ${sequence} · BLOCK ${block}` : `SEQUENCE ${sequence}`);
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={`${STATE_LABEL[state]}${rebind ? " (authority re-bound)" : ""}, sequence ${sequence}${block ? `, block ${block}` : ""}${date ? `, ${date}` : ""}`}
      className={animate ? "stamp-in" : undefined}
      style={{ ["--stamp-rot" as string]: `${rotate}deg`, transform: `rotate(${rotate}deg)`, color }}
    >
      <defs>
        <path id={`${id}-t`} d="M 30 100 A 70 70 0 0 1 170 100" />
        <path id={`${id}-b`} d="M 26 100 A 74 74 0 0 0 174 100" />
      </defs>
      <g fill="none" stroke="currentColor" opacity={0.92}>
        <circle cx="100" cy="100" r="94" strokeWidth="3.5" />
        <circle cx="100" cy="100" r="86" strokeWidth="1.25" />
        <circle cx="100" cy="100" r="56" strokeWidth="1.25" />
      </g>
      <g fill="currentColor" fontFamily="var(--font-mono)" fontSize="10.5" letterSpacing="1.6" opacity={0.92}>
        <text>
          <textPath href={`#${id}-t`} startOffset="50%" textAnchor="middle" {...fit(top, 196)}>
            {top}
          </textPath>
        </text>
        <text dominantBaseline="hanging">
          <textPath href={`#${id}-b`} startOffset="50%" textAnchor="middle" {...fit(bottom, 196)}>
            {bottom}
          </textPath>
        </text>
      </g>
      <g fill="currentColor" textAnchor="middle" opacity={0.95}>
        <text x="100" y={date ? 100 : 106} fontFamily="var(--font-serif)" fontSize={state.length > 9 ? 24 : 28} letterSpacing="0.5">
          {rebind ? "RE-BOUND" : state}
        </text>
        {date ? (
          <text x="100" y="121" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="1">
            {date}
          </text>
        ) : null}
      </g>
    </svg>
  );
}

/** Squeeze ring text into its half-circle when it would otherwise run past the ends. */
function fit(text: string, max: number) {
  const natural = text.length * 8.4;
  return natural > max ? { textLength: max, lengthAdjust: "spacingAndGlyphs" as const } : {};
}

export function StateBadge({ state }: { state: StateName }) {
  const color = STATE_COLOR[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide uppercase"
      style={{ color, borderColor: `color-mix(in oklab, ${color} 45%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {STATE_LABEL[state]}
    </span>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="32" cy="32" r="23.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <text x="32" y="42" textAnchor="middle" fontFamily="var(--font-serif)" fontSize="28" fill="currentColor">
        S
      </text>
    </svg>
  );
}
