// Shared plumbing for the ops scripts. Private keys never leave this module's scope as strings
// printed anywhere: callers get viem accounts, and only `.address` is ever logged.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import canonicalize from "canonicalize";
import { createPublicClient, createWalletClient, http, defineChain, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";

export const OPS_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(OPS_DIR, "..");
export const SECRETS_DIR = join(OPS_DIR, ".secrets");
export const TESTNET = process.env.NETWORK === "bsc-testnet";
export const DEPLOYMENT_FILE = join(OPS_DIR, TESTNET ? "deployment-testnet.json" : "deployment.json");

// ERC-8004 IdentityRegistry, same v2.0.0 implementation on both networks.
export const IDENTITY_REGISTRY = TESTNET ? "0x8004A818BFB912233c491871b3d84c89A494BD9e" : "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

export const VAI = process.argv.includes("--vai");

export function rpcUrl() {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  return TESTNET ? "https://bsc-testnet-rpc.publicnode.com" : "https://bsc-dataseed.bnbchain.org";
}

export function isLocalRpc(url = rpcUrl()) {
  const h = new URL(url).hostname;
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

/// Broadcast gate: --vai is always required. Against real chains only NETWORK=bsc (chain 56)
/// is accepted. A localhost RPC (anvil fork) is accepted without NETWORK.
export async function assertBroadcastAllowed(publicClient) {
  if (!VAI) return false;
  const chainId = await publicClient.getChainId();
  if (isLocalRpc()) return true;
  if (process.env.NETWORK !== "bsc" && !TESTNET) {
    throw new Error("--vai against a non-local RPC requires NETWORK=bsc or NETWORK=bsc-testnet");
  }
  const want = TESTNET ? 97 : 56;
  if (chainId !== want) throw new Error(`NETWORK=${process.env.NETWORK} but RPC reports chainId ${chainId}`);
  return true;
}

export function chainFor(chainId) {
  if (chainId === 56) return { ...bsc, rpcUrls: { default: { http: [rpcUrl()] } } };
  return defineChain({ id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl()] } } });
}

export async function clients() {
  const transport = http(rpcUrl(), { timeout: 30_000, retryCount: 3 });
  const probe = createPublicClient({ transport });
  const chainId = await probe.getChainId();
  const chain = chainFor(chainId);
  const publicClient = createPublicClient({ chain, transport });
  const walletFor = (account) => createWalletClient({ chain, transport, account });
  return { publicClient, walletFor, chainId, chain };
}

export function loadAccount(name) {
  const p = join(SECRETS_DIR, `${name}.json`);
  if (!existsSync(p)) throw new Error(`missing ${p} — run: node wallets.mjs`);
  const j = JSON.parse(readFileSync(p, "utf8"));
  const account = privateKeyToAccount(j.privateKey);
  if (account.address.toLowerCase() !== j.address.toLowerCase()) throw new Error(`${name}: key/address mismatch`);
  return account;
}

export function loadArtifact() {
  const p = join(ROOT, "contracts", "out", "AgentLifecycleRegistry.sol", "AgentLifecycleRegistry.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

export function loadDeployment() {
  if (!existsSync(DEPLOYMENT_FILE)) throw new Error("ops/deployment.json missing — run deploy.mjs --vai first");
  return JSON.parse(readFileSync(DEPLOYMENT_FILE, "utf8"));
}

export function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
}

/// ALP digest: SHA-256 over RFC 8785 canonical JSON, 0x-lowercase hex.
export function jcsDigest(obj) {
  return "0x" + createHash("sha256").update(canonicalize(obj), "utf8").digest("hex");
}

export function salt() {
  return "0x" + randomBytes(32).toString("hex");
}

export function agentRegistryString(chainId) {
  return `eip155:${chainId}:${IDENTITY_REGISTRY.toLowerCase()}`;
}

export function bnb(wei) {
  return formatEther(wei);
}

/// Cost table for a gas amount at the two reference gas prices.
export function costLine(gas) {
  const at = (gwei) => formatEther(BigInt(gas) * BigInt(Math.round(gwei * 1e9)));
  return `${gas} gas  ≈ ${at(0.05)} BNB @0.05 gwei | ${at(0.1)} BNB @0.1 gwei`;
}

/// Finalized checkpoint per BAP-728 4.5: chainId, block number, block hash, tx hash, receipt status.
/// On BSC the `finalized` tag is fast finality. On anvil the tag is not finality evidence.
export async function checkpoint(publicClient, chainId, receipt) {
  const cp = {
    chainId,
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    transactionHash: receipt.transactionHash,
    receiptStatus: receipt.status === "success" ? 1 : 0,
  };
  if (isLocalRpc()) {
    cp.finality = "anvil-local, not finality evidence";
    return cp;
  }
  // Wait until the finalized head covers this block, then confirm the hash is unchanged.
  for (let i = 0; i < 60; i++) {
    const fin = await publicClient.getBlock({ blockTag: "finalized" });
    if (fin.number >= receipt.blockNumber) {
      const b = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
      if (b.hash !== receipt.blockHash) throw new Error(`reorg: ${receipt.transactionHash} block hash changed`);
      cp.finality = "bsc-fast-finality";
      cp.finalizedHead = fin.number.toString();
      return cp;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`block ${receipt.blockNumber} not finalized after 90s — leave as pending, reconcile before retry`);
}
