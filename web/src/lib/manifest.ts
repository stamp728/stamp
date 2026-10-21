import { lifecycleAbi } from "./abi-lifecycle";
import { alpDigest } from "./alp";
import {
  ALP_VERSION,
  CHAIN_ID,
  BINDING_NAME,
  CAIP2,
  IDENTITY_PINS,
  LIFECYCLE_DEPLOY_BLOCK,
  LIFECYCLE_DEPLOY_TX,
  LIFECYCLE_REGISTRY,
} from "./config";

/** ERC-8004 functions and events this binding relies on, in canonical form. */
const IDENTITY_ABI_USED = [
  "function ownerOf(uint256) view returns (address)",
  "function getAgentWallet(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function register(string) returns (uint256)",
  "function setAgentURI(uint256,string)",
  "function setAgentWallet(uint256,address,uint256,bytes)",
  "function eip712Domain() view returns (bytes1,string,string,uint256,address,bytes32,uint256[])",
  "event Registered(uint256 indexed,string,address indexed)",
  "event Transfer(address indexed,address indexed,uint256 indexed)",
  "event MetadataSet(uint256 indexed,string indexed,string,bytes)",
];

/**
 * BAP-728 section 4.2 deployment manifest. Deterministic: same configuration, same digest.
 * Everything here is re-checkable on chain or against the pinned documents.
 */
export function buildManifest() {
  return {
    record: "stamp-binding-manifest",
    binding: BINDING_NAME,
    binding_version: "1.0.0",
    author: "Stamp (independent implementation, not affiliated with BNB Chain)",
    alp_version: ALP_VERSION,
    network: CAIP2,
    modules: {
      CORE: { version: "0.4", scope: "lifecycle registry, evidence commitments, idempotent transitions; signer and accounting not provided" },
      DISC: { version: "0.4", scope: "descriptor + EIP-712 handshake verifier; reference agent server" },
      SCHEMA: { version: "0.4", scope: "A.1, A.2, A.3, A.4 validated against the unmodified schema" },
      CONF: { version: "0.4", scope: "self-attested results, see conformance" },
      A2A: null,
      RT: null,
      VERIFY: null,
      COMM: null,
    },
    identity_registry: {
      standard: "ERC-8004",
      address: IDENTITY_PINS.proxy,
      proxy: "ERC-1967 UUPS",
      implementation: IDENTITY_PINS.implementation,
      implementation_codehash: "0xa5f9624ea85e45b3f4b8558581f03bfb3e6cefab278d7bf0500ec9bd065dc16f",
      upgrade_authority: IDENTITY_PINS.upgradeAuthority,
      version: IDENTITY_PINS.version,
      eip712_domain: { name: IDENTITY_PINS.eip712Name, version: IDENTITY_PINS.eip712Version, chainId: CHAIN_ID },
      source: { repository: IDENTITY_PINS.sourceRepo, revision: IDENTITY_PINS.sourceRevision },
      abi_used_digest: alpDigest(IDENTITY_ABI_USED),
      invalidation_rule:
        "If the ERC-1967 implementation slot or its codehash differs from the values above, verifiers must treat cached compatibility as void and re-validate before relying on any record.",
    },
    lifecycle_registry: {
      address: LIFECYCLE_REGISTRY,
      deploy_transaction: LIFECYCLE_DEPLOY_TX || null,
      deploy_block: LIFECYCLE_DEPLOY_BLOCK.toString(),
      runtime_codehash: process.env.NEXT_PUBLIC_LIFECYCLE_CODEHASH || null,
      source_sha256: "620ea7057c64ef08bc2a247172a8efad020630ec4d917080a977cabd7a6a6cce",
      compiler: { solc: "0.8.26", optimizer_runs: 10000, via_ir: true, evm_version: "cancun" },
      abi_digest: alpDigest(lifecycleAbi),
      upgrade_authority: null,
      admin_functions: [],
      eip712_domain: { name: "Agent Lifecycle Protocol", version: "0.4", chainId: CHAIN_ID, verifyingContract: LIFECYCLE_REGISTRY },
    },
    payment: {
      supported: false,
      note: "Stamp does not provide an x402 facilitator, payment tokens or a signer. Agents bring their own and must enforce the approved policy.",
    },
    commerce: { supported: false },
    finality: {
      rule: "A checkpoint is final when its block number is at or below the 'finalized' block reported by the RPC and the block hash at that height matches the receipt. BSC fast finality normally finalizes within a few blocks.",
      rpc_assumptions:
        "Public RPCs (bsc-dataseed.bnbchain.org, bsc-rpc.publicnode.com, rpc-bsc.48.club). If they disagree on a block hash, the verifier reports the check as failed and does not advance.",
      receipt_alone_is_final: false,
    },
    bindings: {
      agent_registry_string: "eip155:<chainId>:<identity registry, lowercase hex>",
      operation_id_onchain: "sha256(utf8(operation_id))",
      evidence_commitment: "sha256(RFC 8785 JSON of the evidence document, which includes a random 32-byte salt)",
      policy_owner_approval:
        "EIP-712 ALPPolicyApproval(string agentRegistry,string agentId,bytes32 policyDigest,uint256 policyVersion) signed by the owner, lifecycle registry domain",
      handshake_wire: "POST JSON {audience, nonce, descriptor_digest} to handshake_endpoint; response is an A.2 record whose proof is the 0x signature",
      handshake_clock_skew_seconds: 30,
    },
    dependencies: [
      {
        name: "BAP-728",
        repository: "https://github.com/bnb-chain/BEPs",
        revision: "a12e7e03f25c1b901fbb2dbc51374abc216bbccb",
        path: "BAPs/BAP-728.md",
        sha256: "0x7484a69814f0e87b673a9891c55f896f96e7e19634c0afc50707e321ef8ec32a",
      },
      {
        name: "ALP v0.4-draft protocol",
        path: "BAPs/assets/bap-alp/protocol.md",
        sha256: "0xe0d2680c29c8530a693c29a9a460e97d777c7d90226dfd81643e84c9c3e44596",
      },
      {
        name: "ALP conformance matrix",
        path: "BAPs/assets/bap-alp/conformance.md",
        sha256: "0xcabec402ad4feb0371960e59f4ae6fa0f07acd2ae9eddff488aa495d16464da3",
      },
      {
        name: "ALP schemas",
        path: "BAPs/assets/bap-alp/schemas.json",
        sha256: "0x0fdd165072f6b3bc2d97669bb1eee48e9b9793adc8c64b6ce7933df7978b6e37",
      },
      { name: "ERC-8004", url: "https://eips.ethereum.org/EIPS/eip-8004", status: "draft" },
    ],
  };
}

export function manifestDigest() {
  return alpDigest(buildManifest());
}
