// Deploys AgentLifecycleRegistry pinned to the ERC-8004 IdentityRegistry on BSC.
// Default: dry run (gas + cost). Broadcast: --vai and NETWORK=bsc (or a localhost anvil RPC).
import { createHash } from "node:crypto";
import { encodeDeployData, keccak256 } from "viem";
import {
  IDENTITY_REGISTRY, DEPLOYMENT_FILE, clients, loadAccount, loadArtifact, assertBroadcastAllowed,
  writeJson, costLine, bnb, rpcUrl, checkpoint,
} from "./lib.mjs";

const art = loadArtifact();
const ops = loadAccount("ops");
const { publicClient, walletFor, chainId } = await clients();

const idCode = await publicClient.getCode({ address: IDENTITY_REGISTRY });
if (!idCode || idCode === "0x") throw new Error("IdentityRegistry has no code on this RPC");

const data = encodeDeployData({ abi: art.abi, bytecode: art.bytecode.object, args: [IDENTITY_REGISTRY] });
const gas = await publicClient.estimateGas({ account: ops.address, data });
const gasPrice = await publicClient.getGasPrice();
const balance = await publicClient.getBalance({ address: ops.address });
const settingsDigest = "0x" + createHash("sha256").update(art.rawMetadata ?? JSON.stringify(art.metadata ?? {})).digest("hex");

console.log(`rpc        ${new URL(rpcUrl()).host}  chainId ${chainId}`);
console.log(`deployer   ${ops.address}  balance ${bnb(balance)} BNB`);
console.log(`estimate   ${costLine(gas)}  (node gasPrice ${Number(gasPrice) / 1e9} gwei)`);
console.log(`compiler   ${art.metadata?.compiler?.version ?? "?"}  metadata sha256 ${settingsDigest}`);

if (!(await assertBroadcastAllowed(publicClient))) {
  console.log("\nDRY RUN — nothing sent. Broadcast with: NETWORK=bsc node deploy.mjs --vai");
} else {

const hash = await walletFor(ops).deployContract({ abi: art.abi, bytecode: art.bytecode.object, args: [IDENTITY_REGISTRY], gas: (gas * 12n) / 10n });
console.log(`tx         ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error("deploy reverted");
const address = receipt.contractAddress;
const runtime = await publicClient.getCode({ address });
const cp = await checkpoint(publicClient, chainId, receipt);

const out = {
  chainId,
  network: `eip155:${chainId}`,
  address,
  identityRegistry: IDENTITY_REGISTRY,
  txHash: hash,
  block: receipt.blockNumber.toString(),
  blockHash: receipt.blockHash,
  deployer: ops.address,
  gasUsed: receipt.gasUsed.toString(),
  codehash: keccak256(runtime),
  compiler: art.metadata?.compiler?.version,
  compilerSettingsDigest: settingsDigest,
  checkpoint: cp,
  deployedAt: new Date().toISOString(),
};
writeJson(DEPLOYMENT_FILE, out);
console.log(`deployed   ${address}  gasUsed ${receipt.gasUsed}  codehash ${out.codehash}`);
console.log(`finality   ${cp.finality}`);
}
