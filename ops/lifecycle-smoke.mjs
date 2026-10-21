// Testnet-only smoke of every on-chain edge on a throwaway agent:
// register -> ACTIVE -> SUSPENDED -> ACTIVE (resume) -> owner RETIRED -> every revival attempt must revert.
import { encodeAbiParameters, sha256, toBytes } from "viem";
import { IDENTITY_REGISTRY, TESTNET, clients, loadAccount, loadArtifact, loadDeployment, assertBroadcastAllowed, writeJson, OPS_DIR } from "./lib.mjs";
import { join } from "node:path";
import { IDENTITY_ABI } from "../kit/alp.mjs";
import { randomBytes } from "node:crypto";

if (!TESTNET) throw new Error("testnet only");
const { publicClient, walletFor, chainId } = await clients();
if (!(await assertBroadcastAllowed(publicClient))) { console.log("dry run; add --vai"); process.exitCode = 0; }
else {
const art = loadArtifact(); const abi = art.abi;
const dep = loadDeployment(); const L = dep.address;
const ops = loadAccount("ops"), ctl = loadAccount("controller");
const throwaway = (await import("viem/accounts")).privateKeyToAccount("0x" + randomBytes(32).toString("hex"));
const h = (s) => sha256(toBytes(s + ":" + Date.now() + ":" + randomBytes(4).toString("hex")));
const log = [];
async function send(label, acct, call) {
  const w = walletFor(acct);
  const { request } = await publicClient.simulateContract({ ...call, account: acct });
  const hash = await w.writeContract(request);
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(label + " reverted");
  const rec = call.args && call.address === L ? await publicClient.readContract({ address: L, abi, functionName: "getRecord", args: [call.args[0]] }) : null;
  console.log(label.padEnd(22), hash, rec ? `state=${rec.state} seq=${rec.sequence} epoch=${rec.authorityEpoch}` : "");
  log.push({ label, hash, block: r.blockNumber.toString() });
  return r;
}
async function mustRevert(label, acct, call) {
  try { await publicClient.simulateContract({ ...call, account: acct }); console.log("UNEXPECTED OK", label); log.push({ label, ok: false }); }
  catch (e) { const m = (e.shortMessage || e.message).split("\n")[0]; console.log(`refused ${label.padEnd(18)} ${m.slice(0, 90)}`); log.push({ label, refused: m }); }
}
const r1 = await send("erc8004.register", ops, { address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "register", args: ["data:application/json;base64,eyJuYW1lIjoic3RhbXAtc21va2UifQ=="] });
const ev = r1.logs.find((l) => l.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase() && l.topics.length === 3);
const id = BigInt(ev.topics[1]);
const [, n, v, c, vc] = await publicClient.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "eip712Domain" });
const blk = await publicClient.getBlock(); const deadline = blk.timestamp + 240n;
const sig = await throwaway.signTypedData({ domain: { name: n, version: v, chainId: Number(c), verifyingContract: vc }, types: { AgentWalletSet: [{ name: "agentId", type: "uint256" }, { name: "newWallet", type: "address" }, { name: "owner", type: "address" }, { name: "deadline", type: "uint256" }] }, primaryType: "AgentWalletSet", message: { agentId: id, newWallet: throwaway.address, owner: ops.address, deadline } });
await send("erc8004.setAgentWallet", ops, { address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "setAgentWallet", args: [id, throwaway.address, deadline, sig] });
const P = h("policy");
await send("register", ops, { address: L, abi, functionName: "register", args: [id, ctl.address, P, h("ev"), h("op")] });
await send("activate (ctl)", ctl, { address: L, abi, functionName: "transition", args: [id, 1n, 4, 1n, P, h("ev"), h("op")] });
await mustRevert("stale sequence", ops, { address: L, abi, functionName: "transition", args: [id, 1n, 5, 1n, P, h("ev"), h("op")] });
await mustRevert("owner activate", ops, { address: L, abi, functionName: "transition", args: [id, 2n, 4, 2n, P, h("ev"), h("op")] });
await mustRevert("policy swap", ctl, { address: L, abi, functionName: "transition", args: [id, 2n, 5, 1n, h("rogue"), h("ev"), h("op")] });
await send("suspend (ctl)", ctl, { address: L, abi, functionName: "transition", args: [id, 2n, 5, 1n, P, h("ev"), h("op")] });
await send("resume (ctl)", ctl, { address: L, abi, functionName: "transition", args: [id, 3n, 4, 2n, P, h("ev"), h("op")] });
await send("retire (owner)", ops, { address: L, abi, functionName: "transition", args: [id, 4n, 6, 2n, P, h("ev"), h("op")] });
await mustRevert("revive ACTIVE", ctl, { address: L, abi, functionName: "transition", args: [id, 5n, 4, 3n, P, h("ev"), h("op")] });
await mustRevert("rebind retired", ops, { address: L, abi, functionName: "rebind", args: [id, 5n, ctl.address, P, h("ev"), h("op")] });
await mustRevert("re-register", ops, { address: L, abi, functionName: "register", args: [id, ctl.address, P, h("ev"), h("op")] });
writeJson(join(OPS_DIR, "demo-testnet", "lifecycle-smoke.json"), { chainId, lifecycle: L, agentId: id.toString(), steps: log });
console.log("agent", id.toString(), "done");
}
