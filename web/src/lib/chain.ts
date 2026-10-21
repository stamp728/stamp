import { createPublicClient, fallback, http, parseAbi, type Address, type Hex } from "viem";
import { lifecycleAbi } from "./abi-lifecycle";
import { CHAIN, IDENTITY_REGISTRY, LIFECYCLE_REGISTRY, LOGS_RPC_URL, RPC_URLS } from "./config";
import { STATES, type StateName } from "./alp";

export const identityAbi = parseAbi([
  "function ownerOf(uint256 agentId) view returns (address)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function getVersion() pure returns (string)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
  "function register(string agentURI) returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)",
]);

export { lifecycleAbi };

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: fallback(RPC_URLS.map((u) => http(u, { timeout: 12_000, retryCount: 1 }))),
  batch: { multicall: true },
});

export const logsClient = createPublicClient({
  chain: CHAIN,
  transport: http(LOGS_RPC_URL, { timeout: 15_000, retryCount: 1 }),
});

export type LifecycleRecord = {
  controller: Address;
  sequence: bigint;
  state: StateName;
  retired: boolean;
  ownerSnapshot: Address;
  authorityEpoch: bigint;
  walletSnapshot: Address;
  updatedAtBlock: bigint;
  evidence: Hex;
  policyDigest: Hex;
};

export type AgentSnapshot = {
  agentId: bigint;
  exists: boolean;
  owner: Address | null;
  wallet: Address | null;
  tokenURI: string | null;
  record: LifecycleRecord | null;
  live: { ownerMatches: boolean; walletMatches: boolean; operational: boolean } | null;
  blockNumber: bigint;
};

const ZERO = "0x0000000000000000000000000000000000000000";

/** One multicall round: ERC-8004 identity + lifecycle record + live status. */
export async function readAgent(agentId: bigint): Promise<AgentSnapshot> {
  const blockNumber = await publicClient.getBlockNumber();
  const calls = [
    { address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "ownerOf", args: [agentId] },
    { address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "getAgentWallet", args: [agentId] },
    { address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "tokenURI", args: [agentId] },
  ] as const;
  const lc = LIFECYCLE_REGISTRY
    ? ([
        { address: LIFECYCLE_REGISTRY, abi: lifecycleAbi, functionName: "getRecord", args: [agentId] },
        { address: LIFECYCLE_REGISTRY, abi: lifecycleAbi, functionName: "liveStatus", args: [agentId] },
      ] as const)
    : ([] as const);
  type Res = { status: "success" | "failure"; result?: unknown }[];
  const res = (await publicClient.multicall({ contracts: [...calls, ...lc] as never, blockNumber, allowFailure: true })) as Res;

  const owner = res[0].status === "success" ? (res[0].result as Address) : null;
  const walletRaw = res[1].status === "success" ? (res[1].result as Address) : null;
  const wallet = walletRaw && walletRaw !== ZERO ? walletRaw : null;
  const tokenURI = res[2].status === "success" ? (res[2].result as string) : null;

  let record: LifecycleRecord | null = null;
  let live: AgentSnapshot["live"] = null;
  if (LIFECYCLE_REGISTRY && res[3]?.status === "success") {
    const r = res[3].result as {
      controller: Address;
      sequence: bigint;
      state: number;
      retired: boolean;
      ownerSnapshot: Address;
      authorityEpoch: bigint;
      walletSnapshot: Address;
      updatedAtBlock: bigint;
      evidence: Hex;
      policyDigest: Hex;
    };
    if (r.state !== 0) {
      record = { ...r, state: STATES[r.state] };
      if (res[4]?.status === "success") {
        const [, ownerMatches, walletMatches, operational] = res[4].result as [number, boolean, boolean, boolean];
        live = { ownerMatches, walletMatches, operational };
      }
    }
  }
  return { agentId, exists: owner !== null, owner, wallet, tokenURI, record, live, blockNumber };
}

export type StampEvent = {
  from: StateName;
  to: StateName;
  sequence: bigint;
  evidence: Hex;
  actor: Address;
  controller: Address;
  authorityEpoch: bigint;
  policyDigest: Hex;
  operationId: Hex;
  previousBlock: bigint;
  blockNumber: bigint;
  timestamp: bigint;
  txHash: Hex;
  rebind: boolean;
};

const transitionEvent = lifecycleAbi.find((x) => x.type === "event" && x.name === "Transition")!;

/**
 * Walks the record history backwards using `previousBlock`: one single-block getLogs per stamp,
 * so it works on any public RPC regardless of block-range limits.
 */
export async function readHistory(agentId: bigint, fromBlock: bigint, max = 64): Promise<StampEvent[]> {
  if (!LIFECYCLE_REGISTRY || fromBlock === 0n) return [];
  const out: StampEvent[] = [];
  let block = fromBlock;
  const seen = new Set<string>();
  while (block > 0n && out.length < max) {
    type RawLog = { logIndex: number | null; transactionHash: Hex | null; args: Record<string, unknown> };
    const logs = (await logsClient.getLogs({
      address: LIFECYCLE_REGISTRY,
      event: transitionEvent as never,
      args: { agentId } as never,
      fromBlock: block,
      toBlock: block,
    })) as unknown as RawLog[];
    if (logs.length === 0) break;
    // Several stamps can land in one block; newest first.
    const sorted = [...logs].sort((a, b) => (b.logIndex ?? 0) - (a.logIndex ?? 0));
    let next = 0n;
    for (const l of sorted) {
      const key = `${l.transactionHash}:${l.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = l.args;
      const from = STATES[Number(a.from)];
      const to = STATES[Number(a.to)];
      out.push({
        from,
        to,
        sequence: a.sequence as bigint,
        evidence: a.evidence as Hex,
        actor: a.actor as Address,
        controller: a.controller as Address,
        authorityEpoch: a.authorityEpoch as bigint,
        policyDigest: a.policyDigest as Hex,
        operationId: a.operationId as Hex,
        previousBlock: a.previousBlock as bigint,
        blockNumber: a.blockNumber as bigint,
        timestamp: a.timestamp as bigint,
        txHash: l.transactionHash as Hex,
        rebind: from === to,
      });
      next = a.previousBlock as bigint;
    }
    if (next === block) break;
    block = next;
  }
  return out.sort((a, b) => Number(b.sequence - a.sequence));
}

export async function readDirectory(start: number, count: number): Promise<{ total: bigint; ids: bigint[] }> {
  if (!LIFECYCLE_REGISTRY) return { total: 0n, ids: [] };
  const total = await publicClient.readContract({ address: LIFECYCLE_REGISTRY, abi: lifecycleAbi, functionName: "agentCount" });
  const ids = await publicClient.readContract({
    address: LIFECYCLE_REGISTRY,
    abi: lifecycleAbi,
    functionName: "agentIds",
    args: [BigInt(start), BigInt(count)],
  });
  return { total, ids: [...ids] };
}
