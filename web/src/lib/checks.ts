import { parseAbiItem, type Address } from "viem";
import type { AgentSnapshot } from "./chain";
import { logsClient } from "./chain";
import { IDENTITY_REGISTRY } from "./config";
import { alpServiceOf } from "./alp";
import type { CheckResult } from "@/components/ui";

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
const metadataEvent = parseAbiItem(
  "event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)",
);

export const SCAN_SPAN = 5_000n;
export const SCAN_LIMIT = 200_000n;

/**
 * Upstream changes since the record was last written. A transfer that went A -> B -> A, or a
 * wallet that was swapped and swapped back, leaves the snapshot matching; only the event log
 * shows it happened (BAP-728 4.3: any identity transfer invalidates sessions).
 */
export async function scanUpstreamChanges(agentId: bigint, fromBlock: bigint, toBlock: bigint, limit = SCAN_LIMIT) {
  const start = toBlock - fromBlock > limit ? toBlock - limit : fromBlock + 1n;
  const ranges: [bigint, bigint][] = [];
  for (let b = start; b <= toBlock; b += SCAN_SPAN) {
    ranges.push([b, b + SCAN_SPAN - 1n > toBlock ? toBlock : b + SCAN_SPAN - 1n]);
  }
  const results = await Promise.all(
    ranges.map(async ([a, b]) => {
      const [t, m] = await Promise.all([
        logsClient.getLogs({ address: IDENTITY_REGISTRY, event: transferEvent, args: { tokenId: agentId }, fromBlock: a, toBlock: b }),
        logsClient.getLogs({ address: IDENTITY_REGISTRY, event: metadataEvent, args: { agentId }, fromBlock: a, toBlock: b }),
      ]);
      return {
        transfers: t.length,
        walletChanges: m.filter((l) => (l.args as { metadataKey?: string }).metadataKey === "agentWallet").length,
      };
    }),
  );
  return {
    transfers: results.reduce((s, r) => s + r.transfers, 0),
    walletChanges: results.reduce((s, r) => s + r.walletChanges, 0),
    scannedFrom: start,
    scannedTo: toBlock,
    complete: start === fromBlock + 1n,
  };
}

export function snapshotChecks(snap: AgentSnapshot, registrationFile: unknown): CheckResult[] {
  const c: CheckResult[] = [];
  const r = snap.record;
  c.push({
    id: "identity",
    label: "ERC-8004 identity exists",
    status: snap.exists ? "pass" : "fail",
    detail: snap.exists ? `Owned by ${snap.owner}` : "The identity registry has no agent with this ID.",
  });
  c.push({
    id: "record",
    label: "Lifecycle record exists",
    status: r ? "pass" : "fail",
    detail: r ? `State ${r.state}, sequence ${r.sequence}, authority epoch ${r.authorityEpoch}.` : "This agent has no passport yet.",
    ref: "BAP-728 4.4",
  });
  if (!r || !snap.live) return c;
  c.push({
    id: "retired",
    label: "Not retired",
    status: r.retired ? "fail" : "pass",
    detail: r.retired ? "Retired permanently. Do not open sessions or pay this agent." : "The record can still change state.",
  });
  c.push({
    id: "owner",
    label: "Owner unchanged since the last record",
    status: snap.live.ownerMatches ? "pass" : r.retired ? "skip" : "fail",
    detail: snap.live.ownerMatches
      ? `Recorded owner ${r.ownerSnapshot} still owns the identity.`
      : `Recorded ${r.ownerSnapshot}, chain now says ${snap.owner ?? "nobody"}.`,
    ref: "BAP-728 4.3",
  });
  c.push({
    id: "wallet",
    label: "Agent wallet unchanged and bound",
    status: snap.live.walletMatches ? "pass" : r.retired ? "skip" : "fail",
    detail: snap.live.walletMatches
      ? `${r.walletSnapshot} is still the verified agent wallet.`
      : `Recorded ${r.walletSnapshot}, registry now says ${snap.wallet ?? "no wallet"}.`,
    ref: "BAP-728 4.3",
  });
  c.push({
    id: "dedicated",
    label: "Dedicated wallet, separate from the owner",
    status: r.walletSnapshot.toLowerCase() !== r.ownerSnapshot.toLowerCase() ? "pass" : "fail",
    detail: "The contract refuses to record an agent whose wallet is the owner's own address.",
    ref: "CORE-01",
  });
  const svc = alpServiceOf(registrationFile);
  c.push({
    id: "alp-service",
    label: "Registration file advertises an ALP descriptor",
    status: svc ? "pass" : "warn",
    detail: svc
      ? `Descriptor at ${svc.endpoint}`
      : "No service named ALP in the ERC-8004 registration file, so clients cannot run the identity handshake.",
    ref: "BAP-728 4.7",
  });
  c.push({
    id: "operational",
    label: "Open for paid work",
    status: snap.live.operational ? "pass" : r.retired ? "fail" : "warn",
    detail: snap.live.operational
      ? "Active, with owner and wallet matching the record."
      : r.state === "ACTIVE"
        ? "Recorded as active, but the binding changed. Treat as suspended."
        : `State is ${r.state}. Only an active agent should receive payments or new tasks.`,
    ref: "DISC-03",
  });
  return c;
}

export const sameAddr = (a?: Address | null, b?: Address | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
