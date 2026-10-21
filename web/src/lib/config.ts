import { bsc, bscTestnet } from "viem/chains";
import type { Address } from "viem";

/** NEXT_PUBLIC_NETWORK=bsc-testnet runs the whole site against BSC testnet (chain 97). */
export const TESTNET = process.env.NEXT_PUBLIC_NETWORK === "bsc-testnet";

/** ERC-8004 IdentityRegistry (UUPS proxy, v2.0.0; same implementation on mainnet and testnet). */
export const IDENTITY_REGISTRY: Address = TESTNET
  ? "0x8004A818BFB912233c491871b3d84c89A494BD9e"
  : "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

/** Pinned upstream facts, re-checked live by the manifest and the verifier. */
export const IDENTITY_PINS = {
  proxy: IDENTITY_REGISTRY,
  implementation: "0x7274e874ca62410a93bd8bf61c69d8045e399c02" as Address,
  upgradeAuthority: "0xF223968Dd0c66472E31043acAcCcF5D1464D644b" as Address,
  version: "2.0.0",
  eip712Name: "ERC8004IdentityRegistry",
  eip712Version: "1",
  sourceRepo: "https://github.com/erc-8004/erc-8004-contracts",
  sourceRevision: "b9e466c250744a7e06b13dff9d3c2844ed64f825",
};

const envRegistry = process.env.NEXT_PUBLIC_LIFECYCLE_REGISTRY;

/** Our AgentLifecycleRegistry. Empty until the mainnet deployment exists. */
export const LIFECYCLE_REGISTRY: Address | null =
  envRegistry && /^0x[0-9a-fA-F]{40}$/.test(envRegistry) ? (envRegistry as Address) : null;

export const LIFECYCLE_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_LIFECYCLE_DEPLOY_BLOCK || "0");
export const LIFECYCLE_DEPLOY_TX = process.env.NEXT_PUBLIC_LIFECYCLE_DEPLOY_TX || "";

export const CHAIN = TESTNET ? bscTestnet : bsc;
export const CHAIN_ID = TESTNET ? 97 : 56;
export const CAIP2 = `eip155:${CHAIN_ID}`;

/** Public RPCs, in fallback order. A local fork can be forced with NEXT_PUBLIC_RPC_URL. */
export const RPC_URLS: string[] = process.env.NEXT_PUBLIC_RPC_URL
  ? [process.env.NEXT_PUBLIC_RPC_URL]
  : TESTNET
    ? ["https://bsc-testnet-rpc.publicnode.com", "https://bsc-testnet-dataseed.bnbchain.org"]
    : ["https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com", "https://rpc-bsc.48.club"];

/** RPC that accepts eth_getLogs over 5,000-block spans without a key. */
export const LOGS_RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || (TESTNET ? "https://bsc-testnet-rpc.publicnode.com" : "https://rpc-bsc.48.club");

export const EXPLORER = TESTNET ? "https://testnet.bscscan.com" : "https://bscscan.com";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/** Showcase agent hosted by this site, if configured. */
export const SHOWCASE_AGENT_ID = process.env.NEXT_PUBLIC_SHOWCASE_AGENT_ID || "";

export const ALP_VERSION = "0.4-draft";
export const BINDING_NAME = TESTNET ? "stamp-bsc-testnet" : "stamp-bsc-mainnet";
export const NETWORK_LABEL = TESTNET ? "BNB Smart Chain Testnet" : "BNB Smart Chain";

/** $STAMP token contract. Empty until launch; the site then shows the zero address as "not launched". */
const envToken = process.env.NEXT_PUBLIC_STAMP_TOKEN;
export const STAMP_TOKEN: Address | null = envToken && /^0x[0-9a-fA-F]{40}$/.test(envToken) ? (envToken as Address) : null;
