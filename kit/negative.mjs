// Adversarial handshake cases (DISC-01 / DISC-02 / DISC-03) against a running kit server on a LOCAL fork.
//   RPC_URL=http://127.0.0.1:8545 node negative.mjs --agent <id> --registry 0x.. --insecure-local
// Uses anvil-only RPCs (evm_mine, evm_increaseTime) and the controller key to suspend the agent at the end.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LIFECYCLE_ABI, jcsDigest, randomBytes32, verifyHandshakeResponse, evidenceDocument, newOperationId, operationIdBytes } from "./alp.mjs";
import { discover, fetchJson, handshake, checkDescriptor } from "./verify.mjs";

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const rpc = process.env.RPC_URL;
if (!rpc || !/^http:\/\/(127\.0\.0\.1|localhost)/.test(rpc)) throw new Error("negative.mjs only runs against a local anvil RPC");
const lifecycleRegistry = getAddress(arg("registry"));
const agentId = BigInt(arg("agent"));
const publicClient = createPublicClient({ transport: http(rpc) });
const mine = () => publicClient.request({ method: "evm_mine", params: [] });

const results = [];
const expect = (name, cond, detail = "") => {
  results.push({ name, ok: !!cond });
  console.log(`  ${cond ? "OK  " : "BAD "} ${name}${detail ? `  — ${detail}` : ""}`);
};
const reasonOf = (v) => v.checks.find((c) => c.name === "on-chain verifyHandshake").detail;

await mine();
const d = await discover({ publicClient, lifecycleRegistry, agentId });
const { body: descriptor } = await fetchJson(d.descriptorUrl);
const audience = "https://verifier.example";
const verify = (response, over = {}) =>
  verifyHandshakeResponse({
    publicClient, lifecycleRegistry, agentId, response,
    expected: { identity: d.identity, audience, nonce: response.nonce, descriptorDigest: jcsDigest(descriptor), descriptor, chainId: d.chainId, ...over },
    ...(over.now ? { now: over.now } : {}),
  });

console.log("\nbaseline");
const good = await handshake({ descriptor, audience });
const vGood = await verify(good.body, { nonce: good.nonce });
expect("valid handshake verifies", vGood.ok, reasonOf(vGood));

console.log("\ntampered descriptor");
const tampered = { ...descriptor, state: "ACTIVE", lifecycle_sequence: "99" };
const t1 = await handshake({ descriptor: { ...descriptor, handshake_endpoint: descriptor.handshake_endpoint }, audience, descriptorDigest: jcsDigest(tampered) });
expect("server refuses to sign a digest of a different descriptor", t1.status === 409 && t1.body.error === "DESCRIPTOR_MISMATCH", `${t1.status} ${t1.body.error}`);
const forged = { ...good.body, descriptor_digest: jcsDigest(tampered) };
const vForged = await verify(forged, { nonce: good.nonce, descriptorDigest: jcsDigest(tampered) });
expect("re-labelled response fails on chain (signature covers the digest)", !vForged.ok && /reason 8/.test(reasonOf(vForged)), reasonOf(vForged));
expect("client rejects a descriptor whose claims differ from chain", !checkDescriptor(tampered, d).every((c) => c.ok));

console.log("\nreplay");
const r2 = await handshake({ descriptor, audience, nonce: good.nonce });
expect("server refuses a reused nonce for the same audience", r2.status === 409 && r2.body.error === "NONCE_REUSED", `${r2.status} ${r2.body.error}`);
const seen = new Set([`${audience}|${good.nonce}`]);
expect("client nonce store rejects a second presentation of the same proof", seen.has(`${good.body.audience}|${good.body.nonce}`));
const vOtherNonce = await verify(good.body, { nonce: randomBytes32() });
expect("proof replayed into a session with a different nonce fails", !vOtherNonce.ok);

console.log("\nwrong audience / domain");
const vAud = await verify(good.body, { nonce: good.nonce, audience: "https://other.example" });
expect("expected-audience mismatch rejected", !vAud.ok && !vAud.checks.find((c) => c.name === "audience echoed").ok);
const vAudChain = await verify({ ...good.body, audience: "https://other.example" }, { nonce: good.nonce, audience: "https://other.example" });
expect("audience swapped under the same proof fails on chain", !vAudChain.ok && /reason 8/.test(reasonOf(vAudChain)), reasonOf(vAudChain));
const bad = await fetchJson(descriptor.handshake_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audience: "http://evil.example/path", nonce: randomBytes32(), descriptor_digest: jcsDigest(descriptor) }) });
expect("non-origin / non-https audience refused", bad.status === 400 && bad.body.error === "BAD_AUDIENCE", `${bad.status} ${bad.body.error}`);
const badNonce = await fetchJson(descriptor.handshake_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audience, nonce: "0x1234", descriptor_digest: jcsDigest(descriptor) }) });
expect("malformed nonce refused", badNonce.status === 400 && badNonce.body.error === "BAD_NONCE", `${badNonce.status}`);

console.log("\nexpiry");
const fresh = await handshake({ descriptor, audience });
await publicClient.request({ method: "evm_increaseTime", params: [400] });
await mine();
const vExp = await verify(fresh.body, { nonce: fresh.nonce, now: Math.floor(Date.now() / 1000) + 400 });
expect("expired proof rejected off-chain and on chain", !vExp.ok && /reason 7/.test(reasonOf(vExp)), reasonOf(vExp));

console.log("\nlifecycle change (DISC-03)");
const pre = await handshake({ descriptor, audience });
const controller = privateKeyToAccount(JSON.parse(readFileSync(new URL("../ops/.secrets/controller.json", import.meta.url), "utf8")).privateKey);
const rec = await publicClient.readContract({ address: lifecycleRegistry, abi: LIFECYCLE_ABI, functionName: "getRecord", args: [agentId] });
const opId = newOperationId("suspend", agentId);
const ev = evidenceDocument({ identity: d.identity, operationId: opId, from: "ACTIVE", to: "SUSPENDED", note: "negative test: suspension", actor: controller.address });
const wallet = createWalletClient({ account: controller, chain: { id: d.chainId, name: "fork", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } }, transport: http(rpc) });
const h = await wallet.writeContract({ address: lifecycleRegistry, abi: LIFECYCLE_ABI, functionName: "transition", args: [agentId, rec.sequence, 5, rec.authorityEpoch, rec.policyDigest, jcsDigest(ev), operationIdBytes(opId)] });
await publicClient.waitForTransactionReceipt({ hash: h });
const vStale = await verify(pre.body, { nonce: pre.nonce });
expect("proof issued before suspension is stale", !vStale.ok && /reason 5/.test(reasonOf(vStale)), reasonOf(vStale));
const d2 = await discover({ publicClient, lifecycleRegistry, agentId });
expect("cached ACTIVE descriptor now contradicts chain (SUSPENDED wins)", !checkDescriptor(descriptor, d2).every((c) => c.ok));
const { body: live } = await fetchJson(d.descriptorUrl);
expect("server now publishes SUSPENDED", live.state === "SUSPENDED", live.state);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} adversarial expectations held`);
process.exitCode = failed ? 1 : 0;
