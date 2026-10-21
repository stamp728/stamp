import canonicalize from "canonicalize";
import { sha256, toBytes, toHex, type Address, type Hex } from "viem";
import { ALP_VERSION, CAIP2, CHAIN_ID, IDENTITY_REGISTRY } from "./config";

/** On-chain enum order (AgentLifecycleRegistry.State). */
export const STATES = ["NONE", "DRAFT", "PROVISIONED", "REGISTERED", "ACTIVE", "SUSPENDED", "RETIRED"] as const;
export type StateName = (typeof STATES)[number];

export const stateIndex = (s: StateName) => STATES.indexOf(s);

/** "eip155:56:0x8004…" — registry address lowercase, as fixed by this binding. */
export const AGENT_REGISTRY = `${CAIP2}:${IDENTITY_REGISTRY.toLowerCase()}`;

export const identityOf = (agentId: bigint | string) => ({
  agentRegistry: AGENT_REGISTRY,
  agentId: BigInt(agentId).toString(),
});

/** RFC 8785 canonical JSON. Throws on values JSON cannot carry. */
export function canonical(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) throw new Error("value cannot be canonicalized");
  return out;
}

/** ALP digest: SHA-256 over RFC 8785 canonical JSON bytes, 0x lowercase hex. */
export function alpDigest(value: unknown): Hex {
  return sha256(toBytes(canonical(value)));
}

export function randomSalt(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return toHex(b);
}

/** Operation identifiers are human strings in ALP records; on chain they are keccak-free bytes32 of sha256. */
export function operationKey(operationId: string): Hex {
  return sha256(toBytes(operationId));
}

export function newOperationId(kind: string, agentId: bigint | string): string {
  const r = randomSalt().slice(2, 14);
  return `stamp:${kind}:${BigInt(agentId).toString()}:${Date.now()}:${r}`;
}

// ------------------------------------------------------------------ EIP-712

/** ERC-8004 v2.0.0 wallet proof, signed by the NEW agent wallet. */
export function agentWalletTypedData(p: {
  agentId: bigint;
  newWallet: Address;
  owner: Address;
  deadline: bigint;
  domain: { name: string; version: string; chainId: number; verifyingContract: Address };
}) {
  return {
    domain: p.domain,
    types: {
      AgentWalletSet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "owner", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "AgentWalletSet" as const,
    message: { agentId: p.agentId, newWallet: p.newWallet, owner: p.owner, deadline: p.deadline },
  };
}

export function lifecycleDomain(registry: Address) {
  return { name: "Agent Lifecycle Protocol", version: "0.4", chainId: CHAIN_ID, verifyingContract: registry } as const;
}

/** This binding's A.3 owner_approval: EIP-712 by the owner over the policy digest. */
export function policyApprovalTypedData(registry: Address, agentId: bigint, policyDigest: Hex, policyVersion: bigint) {
  return {
    domain: lifecycleDomain(registry),
    types: {
      ALPPolicyApproval: [
        { name: "agentRegistry", type: "string" },
        { name: "agentId", type: "string" },
        { name: "policyDigest", type: "bytes32" },
        { name: "policyVersion", type: "uint256" },
      ],
    },
    primaryType: "ALPPolicyApproval" as const,
    message: { agentRegistry: AGENT_REGISTRY, agentId: agentId.toString(), policyDigest, policyVersion },
  };
}

/** ALP-DISC handshake, exact type string from ALP v0.4 section 3. */
export function handshakeTypedData(
  registry: Address,
  h: {
    agentId: string;
    audience: string;
    nonce: Hex;
    descriptorDigest: Hex;
    lifecycleSequence: bigint;
    authorityEpoch: bigint;
    issuedAt: bigint;
    expiresAt: bigint;
  },
) {
  return {
    domain: lifecycleDomain(registry),
    types: {
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
    },
    primaryType: "ALPHandshake" as const,
    message: { agentRegistry: AGENT_REGISTRY, ...h },
  };
}

// ------------------------------------------------------------------ records

export type PolicyProvider = {
  origin: string;
  beneficiary: string;
  contract: string;
  selectors: string[];
  max_charge: string;
  quote_ttl_seconds: number;
};

export type PolicyAsset = {
  network: string;
  asset: string;
  decimals: number;
  resource: string;
  resource_unit: string;
  balance_threshold: string;
  refill_amount: string;
  daily_spend_cap: string;
  balance_floor: string;
  provider_allowlist: PolicyProvider[];
};

/** A.3 without owner_approval: the exact object whose digest the owner signs. */
export function policyBody(agentId: bigint, owner: Address, policyVersion: bigint, assets: PolicyAsset[]) {
  return {
    record: "policy",
    version: ALP_VERSION,
    identity: identityOf(agentId),
    owner,
    policy_version: policyVersion.toString(),
    assets,
  };
}

/**
 * Evidence document committed by every transition. The salt keeps short notes from being
 * guessed from their hash (BAP-728 section 9). The owner keeps the file; only the digest is public.
 */
export function evidenceDocument(p: {
  agentId: bigint | string;
  from: StateName;
  to: StateName;
  operationId: string;
  note: string;
  links: string[];
  actor: Address;
}) {
  return {
    record: "stamp-evidence",
    version: ALP_VERSION,
    identity: identityOf(p.agentId),
    operation_id: p.operationId,
    from: p.from,
    to: p.to,
    note: p.note,
    links: p.links,
    actor: p.actor,
    created_at: Math.floor(Date.now() / 1000),
    salt: randomSalt(),
  };
}

// ------------------------------------------------------------------ ERC-8004 registration file

export type RegistrationService = { name: string; endpoint: string; version?: string };

export type RegistrationFile = {
  type: string;
  name: string;
  description: string;
  image: string;
  services: RegistrationService[];
  registrations: { agentId: number; agentRegistry: string }[];
  supportedTrust?: string[];
};

export const REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";

/** Same shape and encoding as bnbagent-sdk's AgentURIGenerator: base64 of canonical JSON in a data URI. */
export function registrationDataUri(file: RegistrationFile): string {
  const json = canonical(file);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:application/json;base64,${btoa(bin)}`;
}

/** Decode a tokenURI if it is an inline data URI. Remote URIs are fetched server-side only. */
export function decodeDataUri(uri: string): unknown | null {
  const prefix = "data:application/json;base64,";
  if (uri.startsWith(prefix)) {
    const bin = atob(uri.slice(prefix.length));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const plain = "data:application/json,";
  if (uri.startsWith(plain)) return JSON.parse(decodeURIComponent(uri.slice(plain.length)));
  return null;
}

export function alpServiceOf(file: unknown): RegistrationService | null {
  if (!file || typeof file !== "object") return null;
  const services = (file as { services?: unknown; endpoints?: unknown }).services ?? (file as { endpoints?: unknown }).endpoints;
  if (!Array.isArray(services)) return null;
  const hit = services.find(
    (s) => s && typeof s === "object" && typeof (s as RegistrationService).name === "string" && (s as RegistrationService).name.toUpperCase() === "ALP",
  );
  return (hit as RegistrationService) ?? null;
}

export const shortHex = (h: string, n = 6) => (h.length > 2 * n + 2 ? `${h.slice(0, n + 2)}…${h.slice(-n)}` : h);
