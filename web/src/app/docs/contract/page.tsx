import type { Metadata } from "next";
import { EXPLORER, IDENTITY_PINS, IDENTITY_REGISTRY, LIFECYCLE_DEPLOY_BLOCK, LIFECYCLE_REGISTRY } from "@/lib/config";

export const metadata: Metadata = { title: "Contract reference" };

const FUNCS: [string, string, string][] = [
  [
    "register(agentId, controller, policyDigest, evidence, operationId)",
    "Current ERC-8004 owner",
    "Opens the record at REGISTERED, sequence 1, epoch 0. Requires a nonzero agent wallet that differs from the owner, a controller that is not the agent wallet, and nonzero policy and evidence hashes. Once per agent, ever.",
  ],
  [
    "transition(agentId, expectedSequence, next, authorityEpoch, policyDigest, evidence, operationId)",
    "Owner or controller",
    "Moves along a legal edge. expectedSequence must equal the current sequence. policyDigest must equal the stored one. To ACTIVE: controller only, owner and wallet unchanged, epoch strictly higher and at most 1,000,000 above. Other targets: epoch equal to the stored one.",
  ],
  [
    "rebind(agentId, expectedSequence, newController, policyDigest, evidence, operationId)",
    "Current owner",
    "Refreshes the owner and wallet snapshots, sets controller and policy, raises the epoch by one. Not allowed while ACTIVE or after RETIRED.",
  ],
  [
    "flagMismatch(agentId)",
    "Anyone",
    "Suspends a REGISTERED or ACTIVE record whose live owner or wallet differs from its snapshot. The evidence hash is computed on chain from the mismatch.",
  ],
  ["getRecord(agentId)", "View", "The full record."],
  ["liveStatus(agentId)", "View", "State plus ownerMatches, walletMatches and operational (ACTIVE and both matching)."],
  ["agentCount(), agentIds(start, count)", "View", "Every recorded agent in registration order. No indexer needed."],
  ["getOperation(caller, operationId)", "View", "The request hash and resulting sequence of an operation, for reconciliation."],
  ["handshakeDigest(...), verifyHandshake(..., signature)", "View", "EIP-712 digest and full on-chain check of an ALP-DISC handshake. Returns (ok, reason)."],
  ["agentRegistry()", "View", "\"eip155:56:0x8004a169…\", the identity string used in every record."],
];

const ERRORS: [string, string][] = [
  ["AlreadyRecorded", "The agent already has a record (including a retired one)."],
  ["NotRecorded", "No record yet."],
  ["RetiredIsTerminal", "The record is retired; nothing can change it."],
  ["NotOwner / Unauthorized", "Caller lacks the role for this change."],
  ["ControllerFrozen", "The owner changed since the snapshot; the controller may only suspend."],
  ["InvalidEdge(from, to)", "Not an arrow of the state machine. Re-binding while ACTIVE also returns this."],
  ["StaleSequence(expected, current)", "Someone else changed the record first. Re-read and decide again."],
  ["StaleEpoch / EpochJump", "Epoch did not move as required, or jumped too far."],
  ["PolicyMismatch", "The policy hash differs from the stored one. Only the owner changes policy, by re-binding."],
  ["WalletUnset / DedicatedWalletRequired / BindingChanged", "The ERC-8004 wallet is missing, equals the owner, or changed."],
  ["InvalidController", "Zero address or the agent wallet."],
  ["IdempotencyConflict(operationId)", "Same operation id was used before with a different request."],
  ["NothingToFlag", "Owner and wallet still match, or the state cannot be flagged."],
];

export default function Page() {
  return (
    <>
      <h1 className="font-serif text-5xl leading-tight tracking-tight">Contract reference</h1>
      <p className="mt-4 text-lg">
        <code>AgentLifecycleRegistry</code>, Solidity 0.8.26. One contract, about 530 lines with comments, no dependencies beyond
        OpenZeppelin&apos;s EIP-712 and signature helpers.
      </p>

      <h2>Addresses</h2>
      <table>
        <tbody>
          <tr>
            <th>Lifecycle registry</th>
            <td>
              {LIFECYCLE_REGISTRY ? (
                <a href={`${EXPLORER}/address/${LIFECYCLE_REGISTRY}`} target="_blank" rel="noreferrer">
                  <code>{LIFECYCLE_REGISTRY}</code>
                </a>
              ) : (
                "Not deployed yet"
              )}
              {LIFECYCLE_DEPLOY_BLOCK ? <> · block {LIFECYCLE_DEPLOY_BLOCK.toString()}</> : null}
            </td>
          </tr>
          <tr>
            <th>ERC-8004 identity registry</th>
            <td>
              <a href={`${EXPLORER}/address/${IDENTITY_REGISTRY}`} target="_blank" rel="noreferrer">
                <code>{IDENTITY_REGISTRY}</code>
              </a>{" "}
              (proxy; implementation <code>{IDENTITY_PINS.implementation}</code>, version {IDENTITY_PINS.version})
            </td>
          </tr>
          <tr>
            <th>EIP-712 domain</th>
            <td>
              name <code>Agent Lifecycle Protocol</code>, version <code>0.4</code>, chainId 56, verifying contract = the
              lifecycle registry
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Functions</h2>
      <table>
        <thead>
          <tr>
            <th>Function</th>
            <th>Caller</th>
            <th>Rules</th>
          </tr>
        </thead>
        <tbody>
          {FUNCS.map(([f, who, rule]) => (
            <tr key={f}>
              <td>
                <code>{f}</code>
              </td>
              <td>{who}</td>
              <td>{rule}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>State machine</h2>
      <p>
        States are numbered as in ALP v0.4: 0 none, 1 draft, 2 provisioned, 3 registered, 4 active, 5 suspended, 6
        retired. Legal edges: registered to active, suspended or retired; active to suspended or retired; suspended to
        active or retired. Nothing leaves retired.
      </p>

      <h2>Idempotency</h2>
      <p>
        Every write takes a bytes32 <code>operationId</code>, namespaced by the caller. Re-sending the exact same request
        with the same id returns the original sequence without a second effect, even if the record moved on since. Re-using
        the id with any change reverts with <code>IdempotencyConflict</code>. In this binding the on-chain id is{" "}
        <code>sha256(utf8(operation_id))</code> of the human-readable id used in ALP records.
      </p>

      <h2>Events</h2>
      <pre>
        <code>{`event Transition(
  uint256 indexed agentId, State from, State to, uint64 indexed sequence,
  bytes32 evidence, address indexed actor, address controller,
  uint64 authorityEpoch, bytes32 policyDigest, bytes32 operationId,
  uint64 previousBlock, uint256 blockNumber, uint256 timestamp
);
event Rebound(
  uint256 indexed agentId, uint64 indexed sequence, address owner, address wallet,
  address controller, uint64 authorityEpoch, bytes32 policyDigest, bytes32 evidence
);`}</code>
      </pre>
      <p>
        <code>previousBlock</code> links each stamp to the one before it, so a client walks the full history with one
        single-block <code>eth_getLogs</code> per stamp. A re-bind emits <code>Transition</code> with <code>from == to</code>;
        treat it as an authority change, not a state change.
      </p>

      <h2>Errors</h2>
      <table>
        <tbody>
          {ERRORS.map(([e, d]) => (
            <tr key={e}>
              <td>
                <code>{e}</code>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Handshake reasons</h2>
      <p>
        <code>verifyHandshake</code> returns <code>(false, reason)</code> instead of reverting: 1 no record, 2 retired, 3
        owner changed, 4 wallet unset or changed, 5 stale sequence, 6 stale epoch, 7 time window (issued more than 30 s
        after the latest block, expired, or longer than 300 s), 8 bad signature. Signatures are tried as plain ECDSA first,
        then ERC-1271, so EIP-7702 delegated accounts work. Nonce single use and audience binding are the caller&apos;s job.
      </p>

      <h2>Tests</h2>
      <p>
        60 tests with Foundry: 50 unit and fuzz tests (including a 512-run random walk asserting that sequence and epoch
        never decrease and retired never changes), 4 regression tests from the internal review, and 6 tests against the
        live ERC-8004 registry on a BSC mainnet fork, including a real EIP-712 wallet binding, an ERC-1271 smart wallet and
        a transfer that clears the wallet.
      </p>
    </>
  );
}
