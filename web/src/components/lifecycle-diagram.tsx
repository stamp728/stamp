/**
 * The ALP v0.4 state machine as it is enforced by the contract.
 * Dashed nodes are local states that never touch the chain.
 */
export function LifecycleDiagram() {
  const node = (x: number, y: number, label: string, color: string, dashed = false, w = 132) => (
    <g>
      <rect
        x={x - w / 2}
        y={y - 20}
        width={w}
        height={40}
        rx={20}
        fill="var(--card)"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={dashed ? "4 4" : undefined}
      />
      <text x={x} y={y + 4.5} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="12.5" letterSpacing="1.2" fill={color}>
        {label}
      </text>
    </g>
  );
  const arrow = "url(#lc-arrow)";
  return (
    <figure className="w-full">
      <svg viewBox="0 0 860 300" className="h-auto w-full" role="img" aria-labelledby="lc-title lc-desc">
        <title id="lc-title">Agent lifecycle</title>
        <desc id="lc-desc">
          Draft and provisioned are local. Registered is the first on-chain state. From registered an agent can become
          active, suspended or retired. Active and suspended can switch back and forth. Every state can retire, and retired
          is final.
        </desc>
        <defs>
          <marker id="lc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="var(--ink-2)" />
          </marker>
        </defs>

        <rect x="8" y="40" width="300" height="104" rx="14" fill="none" stroke="var(--rule-strong)" strokeDasharray="3 5" />
        <text x="22" y="32" fontSize="12" fill="var(--muted)" fontFamily="var(--font-sans)">
          Off chain, on the owner&apos;s machine
        </text>
        <rect x="330" y="40" width="522" height="250" rx="14" fill="none" stroke="var(--rule-strong)" />
        <text x="344" y="32" fontSize="12" fill="var(--muted)" fontFamily="var(--font-sans)">
          On chain, enforced by the lifecycle registry
        </text>

        {node(88, 92, "DRAFT", "var(--muted)", true, 120)}
        {node(232, 92, "PROVISIONED", "var(--muted)", true, 132)}
        {node(424, 92, "REGISTERED", "var(--registered)")}
        {node(620, 92, "ACTIVE", "var(--active)", false, 112)}
        {node(620, 196, "SUSPENDED", "var(--suspended)")}
        {node(780, 248, "RETIRED", "var(--retired)", false, 112)}

        <g stroke="var(--ink-2)" strokeWidth="1.4" fill="none">
          <path d="M148 92 H164" markerEnd={arrow} />
          <path d="M298 92 H356" markerEnd={arrow} />
          <path d="M490 92 H562" markerEnd={arrow} />
          <path d="M470 112 C 500 196, 520 196, 552 196" markerEnd={arrow} />
          <path d="M606 112 V174" markerEnd={arrow} />
          <path d="M634 174 V114" markerEnd={arrow} />
          <path d="M440 112 C 470 262, 640 262, 722 252" markerEnd={arrow} />
          <path d="M676 92 C 760 92, 790 160, 784 226" markerEnd={arrow} />
          <path d="M686 206 C 730 214, 760 222, 766 228" markerEnd={arrow} />
        </g>
        <g fontSize="11" fill="var(--muted)" fontFamily="var(--font-sans)">
          <text x="500" y="84">controller</text>
          <text x="644" y="146">resume</text>
          <text x="548" y="146">suspend</text>
          <text x="742" y="120">retire</text>
        </g>
      </svg>
      <figcaption className="mt-3 text-sm text-muted">
        Retired has no way out. Not the owner, not a new owner after a sale, not the people who deployed the contract.
      </figcaption>
    </figure>
  );
}
