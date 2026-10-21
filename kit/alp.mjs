// ALP v0.4-draft helpers for the Stamp BSC binding (BAP-728).
// Pure functions + viem calls. Used by the reference agent server, the verify CLI and the ops scripts.
import { createHash, randomBytes } from "node:crypto";
import canonicalize from "canonicalize";
import { parseAbi, recoverTypedDataAddress } from "viem";

export const ALP_VERSION = "0.4-draft";
export const HANDSHAKE_TTL = 120; // seconds; protocol maximum is 300
// The contract rejects issuedAt > block.timestamp. eth_call runs against the latest block, whose
// timestamp trails wall clock by up to a block (and by more on a quiet fork), so issuedAt is
// backdated a little. The signed window stays issuedAt..issuedAt+TTL, well under 300s.
export const CLOCK_SKEW = 15;
export const MAX_HANDSHAKE_TTL = 300;
export const STATES = ["NONE", "DRAFT", "PROVISIONED", "REGISTERED", "ACTIVE", "SUSPENDED", "RETIRED"];

export const LIFECYCLE_ABI = parseAbi([
  "struct Record { address controller; uint64 sequence; uint8 state; bool retired; address ownerSnapshot; uint64 authorityEpoch; address walletSnapshot; uint64 updatedAtBlock; bytes32 evidence; bytes32 policyDigest; }",
  "function getRecord(uint256 agentId) view returns (Record)",
  "function agentRegistry() view returns (string)",
  "function IDENTITY_REGISTRY() view returns (address)",
  "function verifyHandshake(uint256 agentId, string audience, bytes32 nonce, bytes32 descriptorDigest, uint256 lifecycleSequence, uint256 authorityEpoch, uint256 issuedAt, uint256 expiresAt, bytes signature) view returns (bool ok, uint8 reason)",
  "function handshakeDigest(uint256 agentId, string audience, bytes32 nonce, bytes32 descriptorDigest, uint256 lifecycleSequence, uint256 authorityEpoch, uint256 issuedAt, uint256 expiresAt) view returns (bytes32)",
  "function register(uint256 agentId, address controller, bytes32 policyDigest, bytes32 evidence, bytes32 operationId) returns (uint64)",
  "function transition(uint256 agentId, uint64 expectedSequence, uint8 next, uint64 authorityEpoch, bytes32 policyDigest, bytes32 evidence, bytes32 operationId) returns (uint64)",
]);

export const IDENTITY_ABI = parseAbi([
  "function register(string agentURI) returns (uint256)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

export const VERIFY_REASONS = [
  "ok", "no record", "retired", "owner changed", "wallet unset/changed",
  "stale sequence", "stale epoch", "bad time window", "bad signature",
];

// ------------------------------------------------------------------ digests and ids

export function sha256Hex(bytesOrString) {
  return "0x" + createHash("sha256").update(bytesOrString).digest("hex");
}

/** ALP digest: SHA-256 over RFC 8785 canonical JSON. */
export function jcsDigest(obj) {
  return sha256Hex(Buffer.from(canonicalize(obj), "utf8"));
}

/** On-chain bytes32 operation id = sha256(utf8(operation_id)). */
export function operationIdBytes(operationId) {
  return sha256Hex(Buffer.from(operationId, "utf8"));
}

export function newOperationId(kind, agentId) {
  return `stamp:${kind}:${agentId}:${Date.now()}:${randomBytes(6).toString("hex")}`;
}

export function randomBytes32() {
  return "0x" + randomBytes(32).toString("hex");
}

export function agentRegistryString(chainId, identityRegistry) {
  return `eip155:${chainId}:${identityRegistry.toLowerCase()}`;
}

export function identityOf(chainId, identityRegistry, agentId) {
  return { agentRegistry: agentRegistryString(chainId, identityRegistry), agentId: BigInt(agentId).toString() };
}

// ------------------------------------------------------------------ records

export function evidenceDocument({ identity, operationId, from, to, note, links = [], actor }) {
  return {
    record: "stamp-evidence",
    version: ALP_VERSION,
    identity,
    operation_id: operationId,
    from,
    to,
    note,
    links,
    actor,
    created_at: Math.floor(Date.now() / 1000),
    salt: randomBytes32(),
  };
}

/** Registration file (ERC-8004 registration-v1) as a canonical-JSON base64 data URI. */
export function registrationDataUri({ name, description, image = "", origin, extraServices = [] }) {
  const file = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name,
    description,
    image,
    services: [
      { name: "ALP", endpoint: `${origin}/.well-known/alp.json`, version: ALP_VERSION },
      ...extraServices,
    ],
    registrations: [],
  };
  return { file, uri: "data:application/json;base64," + Buffer.from(canonicalize(file), "utf8").toString("base64") };
}

export function decodeDataUri(uri) {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix)) return null;
  return JSON.parse(Buffer.from(uri.slice(prefix.length), "base64").toString("utf8"));
}

export function lifecycleDomain(chainId, lifecycleRegistry) {
  return { name: "Agent Lifecycle Protocol", version: "0.4", chainId, verifyingContract: lifecycleRegistry };
}

export const HANDSHAKE_TYPES = {
  ALPHandshake: [
    { name: "agentRegistry", type: "string" },
    { name: "agentId", type: "string" },
    { name: "audience", type: "string" },
    { name: "nonce", type: "bytes32" },
    { name: "descriptorDigest", type: "bytes32" },
    { name: "lifecycleSequence", type: "uint256" },
    { name: "authorityEpoch", type: "uint256" },
    { name: "issuedAt", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
  ],
};

export const POLICY_APPROVAL_TYPES = {
  ALPPolicyApproval: [
    { name: "agentRegistry", type: "string" },
    { name: "agentId", type: "string" },
    { name: "policyDigest", type: "bytes32" },
    { name: "policyVersion", type: "uint256" },
  ],
};

/** A.1 descriptor from a live lifecycle record. */
export function buildDescriptor({ identity, record, handshakeEndpoint, bindingDigest, profiles = ["Core Agent"] }) {
  return {
    record: "descriptor",
    version: ALP_VERSION,
    identity,
    state: STATES[Number(record.state)],
    lifecycle_sequence: BigInt(record.sequence).toString(),
    authority_epoch: BigInt(record.authorityEpoch).toString(),
    policy_digest: record.policyDigest.toLowerCase(),
    profiles,
    handshake_endpoint: handshakeEndpoint,
    bindings: [{ name: "stamp-bsc-mainnet", digest: bindingDigest }],
  };
}

// ------------------------------------------------------------------ input validation

const HEX32 = /^0x[0-9a-f]{64}$/;

/** Origin only: https scheme + authority, no path/query/fragment/userinfo. */
export function isHttpsOrigin(s, { allowLocalHttp = false } = {}) {
  if (typeof s !== "string" || s.length > 255) return false;
  let u;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  const schemeOk = u.protocol === "https:" || (allowLocalHttp && local && u.protocol === "http:");
  return schemeOk && !u.username && !u.password && u.origin === s;
}

export function isHex32(s) {
  return typeof s === "string" && HEX32.test(s);
}

// ------------------------------------------------------------------ handshake (server side)

/**
 * Build and sign an A.2 handshake. `account` is a viem local account for the bound agent wallet.
 * Throws a {code} error on bad input; the caller maps it to HTTP 400/409.
 */
export async function signHandshake({ account, chainId, lifecycleRegistry, identity, descriptor, request, allowLocalHttp = false, now = Math.floor(Date.now() / 1000) - CLOCK_SKEW }) {
  const { audience, nonce, descriptor_digest } = request ?? {};
  if (!isHttpsOrigin(audience, { allowLocalHttp })) throw Object.assign(new Error("audience must be an https origin"), { code: "BAD_AUDIENCE" });
  if (!isHex32(nonce)) throw Object.assign(new Error("nonce must be 32 bytes lowercase hex"), { code: "BAD_NONCE" });
  if (!isHex32(descriptor_digest)) throw Object.assign(new Error("descriptor_digest malformed"), { code: "BAD_DIGEST" });
  const current = jcsDigest(descriptor);
  if (descriptor_digest !== current) throw Object.assign(new Error("descriptor changed"), { code: "DESCRIPTOR_MISMATCH", current });
  if (descriptor.state === "RETIRED") throw Object.assign(new Error("agent retired"), { code: "RETIRED" });

  const message = {
    agentRegistry: identity.agentRegistry,
    agentId: identity.agentId,
    audience,
    nonce,
    descriptorDigest: descriptor_digest,
    lifecycleSequence: BigInt(descriptor.lifecycle_sequence),
    authorityEpoch: BigInt(descriptor.authority_epoch),
    issuedAt: BigInt(now),
    expiresAt: BigInt(now + HANDSHAKE_TTL),
  };
  const proof = await account.signTypedData({
    domain: lifecycleDomain(chainId, lifecycleRegistry),
    types: HANDSHAKE_TYPES,
    primaryType: "ALPHandshake",
    message,
  });
  return {
    record: "handshake",
    version: ALP_VERSION,
    identity,
    audience,
    nonce,
    descriptor_digest,
    lifecycle_sequence: descriptor.lifecycle_sequence,
    authority_epoch: descriptor.authority_epoch,
    issued_at: now,
    expires_at: now + HANDSHAKE_TTL,
    proof,
  };
}

// ------------------------------------------------------------------ handshake (client side)

/**
 * Full client verification of an A.2 response. Off-chain checks first (exact echo of what we sent),
 * then the contract's verifyHandshake via eth_call (live owner/wallet/sequence/epoch/time/signature).
 * Returns { ok, checks: [{name, ok, detail}] } — every check is reported, none short-circuits.
 */
export async function verifyHandshakeResponse({ publicClient, lifecycleRegistry, agentId, expected, response, now = Math.floor(Date.now() / 1000) }) {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });
  const r = response ?? {};

  add("record type", r.record === "handshake" && r.version === ALP_VERSION, `${r.record} ${r.version}`);
  add("identity matches", r.identity?.agentRegistry === expected.identity.agentRegistry && r.identity?.agentId === expected.identity.agentId,
    `${r.identity?.agentRegistry} #${r.identity?.agentId}`);
  add("audience echoed", r.audience === expected.audience, r.audience);
  add("nonce echoed", r.nonce === expected.nonce, r.nonce);
  add("descriptor digest echoed", r.descriptor_digest === expected.descriptorDigest, r.descriptor_digest);
  add("sequence matches descriptor", r.lifecycle_sequence === expected.descriptor.lifecycle_sequence, r.lifecycle_sequence);
  add("epoch matches descriptor", r.authority_epoch === expected.descriptor.authority_epoch, r.authority_epoch);
  const ttl = r.expires_at - r.issued_at;
  add("ttl <= 300s and not expired", Number.isInteger(r.issued_at) && Number.isInteger(r.expires_at) && ttl > 0 && ttl <= MAX_HANDSHAKE_TTL && now <= r.expires_at && r.issued_at <= now + 5,
    `ttl ${ttl}s, expires in ${r.expires_at - now}s`);

  let chain = { ok: false, reason: -1 };
  try {
    const [ok, reason] = await publicClient.readContract({
      address: lifecycleRegistry,
      abi: LIFECYCLE_ABI,
      functionName: "verifyHandshake",
      args: [BigInt(agentId), r.audience ?? "", r.nonce ?? "0x" + "0".repeat(64), r.descriptor_digest ?? "0x" + "0".repeat(64),
        BigInt(r.lifecycle_sequence ?? 0), BigInt(r.authority_epoch ?? 0), BigInt(r.issued_at ?? 0), BigInt(r.expires_at ?? 0), r.proof ?? "0x"],
    });
    chain = { ok, reason };
  } catch (e) {
    chain = { ok: false, reason: -1, error: e.shortMessage ?? e.message };
  }
  add("on-chain verifyHandshake", chain.ok, chain.error ?? `reason ${chain.reason} (${VERIFY_REASONS[chain.reason] ?? "rpc error"})`);

  return { ok: checks.every((c) => c.ok), checks, signer: await safeRecover(r, expected, lifecycleRegistry) };
}

async function safeRecover(r, expected, lifecycleRegistry) {
  try {
    return await recoverTypedDataAddress({
      domain: lifecycleDomain(expected.chainId, lifecycleRegistry),
      types: HANDSHAKE_TYPES,
      primaryType: "ALPHandshake",
      message: {
        agentRegistry: r.identity.agentRegistry, agentId: r.identity.agentId, audience: r.audience, nonce: r.nonce,
        descriptorDigest: r.descriptor_digest, lifecycleSequence: BigInt(r.lifecycle_sequence), authorityEpoch: BigInt(r.authority_epoch),
        issuedAt: BigInt(r.issued_at), expiresAt: BigInt(r.expires_at),
      },
      signature: r.proof,
    });
  } catch {
    return null; // ERC-1271 wallets or malformed proofs: the on-chain check is authoritative
  }
}
