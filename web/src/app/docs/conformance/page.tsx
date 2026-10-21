import type { Metadata } from "next";

export const metadata: Metadata = { title: "Conformance" };

type Row = [id: string, scenario: string, status: "met" | "partial" | "agent" | "no", how: string];

const CORE: Row[] = [
  ["CORE-01", "Owner wallet used as the agent wallet; missing approval", "partial", "Contract refuses an owner-as-wallet record (unit + fork test). Explicit owner approval of the policy is enforced by the Issue flow, not the contract."],
  ["CORE-02", "Register exactly once, wallet read back", "met", "Record opens once; the wallet snapshot is read from ERC-8004 in the same call. The Issue flow reads the wallet back after binding."],
  ["CORE-03", "Identity created, wallet proof fails, retry", "partial", "The Issue flow journals the agent ID and resumes against it. A real retry test on mainnet is pending."],
  ["CORE-04", "Activation payment fails or is unfinalized", "agent", "Needs the agent's signer and payment rail. Stamp records the claim; it does not move money."],
  ["CORE-05", "Real payment finalized and credited, then ACTIVE", "agent", "Same. The controller attaches payment and receipt as evidence."],
  ["CORE-06", "Retried operation, changed request, competing sequence", "met", "Unit tests: original result returned, IdempotencyConflict on change, StaleSequence for the loser."],
  ["CORE-07", "Suspension races a payment and a task", "agent", "Gate serialization lives in the agent runtime."],
  ["CORE-08", "Revive a retired agent by any route", "met", "Unit, fuzz and fork tests: no edge, re-bind, re-register or transfer leaves RETIRED."],
  ["CORE-09", "Owner or wallet changes while ACTIVE", "met", "Controller frozen, anyone can suspend, re-bind raises the epoch. Round-trip transfers are caught by the verifier's event scan."],
  ["CORE-10", "Retirement with pending authorizations", "agent", "Revoking allowances and signatures is the operator's job; the record stays terminal."],
  ["PAY-01 … PAY-06", "Signer policy, caps, reservations, clock", "no", "Stamp ships no signer. These belong to whatever wallet stack runs the agent."],
  ["DISC-01", "Valid identity, descriptor and fresh handshake", "met", "Contract verifyHandshake plus the Verify page; proven on a BSC mainnet fork with the reference server."],
  ["DISC-02", "Replay, expiry, wrong audience or chain, stale epoch, altered descriptor", "met", "Unit tests on the contract and 15 adversarial cases against the reference server."],
  ["DISC-03", "Directory says ACTIVE, chain says otherwise", "met", "Every page reads the chain record; the directory is labelled as a hint."],
  ["BSC-01", "Reorg before finality, RPCs disagree", "partial", "Finality rule declared in the manifest; ops scripts check the 'finalized' tag. The website does not yet cross-check two RPCs."],
  ["BSC-02", "Upstream proxy upgraded or ABI digest changed", "met", "Manifest pins the ERC-8004 implementation and its code hash; Verify fails if the proxy slot changes."],
  ["SCHEMA-01", "A.1 to A.8 shape validation", "partial", "A.1, A.2 and A.3 are validated with the unmodified schema. A.4 to A.8 are not produced by Stamp."],
];

const LABEL: Record<Row[2], { text: string; color: string }> = {
  met: { text: "Met", color: "var(--active)" },
  partial: { text: "Partial", color: "var(--registered)" },
  agent: { text: "Agent side", color: "var(--muted)" },
  no: { text: "Not provided", color: "var(--retired)" },
};

export default function Page() {
  return (
    <>
      <h1 className="font-serif text-5xl leading-tight tracking-tight">Conformance</h1>
      <p className="mt-4 text-lg">
        BAP-728 forbids claiming conformance without published, reproducible results. Here they are, test by test,
        including the ones Stamp does not meet.
      </p>

      <h2>The claim</h2>
      <table>
        <tbody>
          <tr>
            <th>Profile</th>
            <td>None claimed in full. Stamp provides the lifecycle registry and discovery pieces of the Core Agent profile.</td>
          </tr>
          <tr>
            <th>Modules</th>
            <td>CORE 0.4 (registry side), DISC 0.4, SCHEMA 0.4 (A.1–A.3), CONF 0.4. Not implemented: A2A, RT, VERIFY, COMM.</td>
          </tr>
          <tr>
            <th>Assessment</th>
            <td>Self-attested by the Stamp authors. No independent assessor.</td>
          </tr>
          <tr>
            <th>Spec revision</th>
            <td>
              BAP-728 and ALP v0.4-draft at bnb-chain/BEPs commit <code>a12e7e03</code>; file hashes in the{" "}
              <a href="/binding/manifest.json">manifest</a>.
            </td>
          </tr>
          <tr>
            <th>Networks tested</th>
            <td>BSC testnet (chain 97): every on-chain edge and refusal, live. BSC mainnet (chain 56): registration, wallet binding and the full handshake against the showcase agent, live. Plus a local mainnet fork for the adversarial cases.</td>
          </tr>
          <tr>
            <th>Date</th>
            <td>21 October 2026</td>
          </tr>
        </tbody>
      </table>

      <h2>Core Agent matrix</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Scenario</th>
            <th>Status</th>
            <th>How</th>
          </tr>
        </thead>
        <tbody>
          {CORE.map(([id, s, st, how]) => (
            <tr key={id}>
              <td>
                <code>{id}</code>
              </td>
              <td>{s}</td>
              <td style={{ color: LABEL[st].color, whiteSpace: "nowrap" }}>{LABEL[st].text}</td>
              <td>{how}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        &quot;Agent side&quot; means the requirement applies to the software that runs the agent and holds its key. A
        registry cannot satisfy it on the agent&apos;s behalf, and Stamp does not pretend to.
      </p>

      <h2>Other profiles</h2>
      <p>
        Portable Runtime (RT-01 to RT-05), A2A (A2A-01, A2A-02), Certified Toolchain (VERIFY-01 to 03) and Commerce
        (COMM-01 to 08) are not implemented. The authority epoch in the registry is the hook a runtime&apos;s fencing service
        would use for RT, and nothing more.
      </p>

      <h2>Reproduce</h2>
      <pre>
        <code>{`# contract: unit, fuzz and review regressions
forge test

# against the live ERC-8004 registry on a mainnet fork
forge test --match-contract Fork --fork-url https://bsc-dataseed.bnbchain.org

# end to end on a fork: deploy, register, bind, record, serve, verify, attack
anvil --fork-url https://bsc-dataseed.bnbchain.org --chain-id 56 --hardfork cancun --block-time 1
node ops/deploy.mjs --vai && node ops/demo-agent.mjs --vai --activate
node kit/server.mjs --insecure-local & node kit/verify.mjs --insecure-local && node kit/negative.mjs --insecure-local`}</code>
      </pre>
    </>
  );
}
