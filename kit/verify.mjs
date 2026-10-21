// Client-side ALP-DISC verification of an agent registered in the Stamp lifecycle registry.
//   node verify.mjs --agent <id> [--registry 0x..] [--audience https://you.example] [--rpc URL] [--insecure-local]
// Exit code 0 only if every check passes.
import { readFileSync, existsSync } from "node:fs";
import { createPublicClient, http, getAddress } from "viem";
import {
  LIFECYCLE_ABI, IDENTITY_ABI, STATES, identityOf, jcsDigest, randomBytes32, decodeDataUri, isHttpsOrigin, verifyHandshakeResponse,
} from "./alp.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
export const INSECURE_LOCAL = process.argv.includes("--insecure-local");

export async function fetchJson(url, init = {}) {
  const u = new URL(url);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(INSECURE_LOCAL && local && u.protocol === "http:")) throw new Error(`refusing non-https URL ${url}`);
  if (u.username || u.password) throw new Error("userinfo in URL");
  const res = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  if (text.length > 64_000) throw new Error("response too large");
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
  return { status: res.status, body };
}

export async function discover({ publicClient, lifecycleRegistry, agentId, descriptorUrl }) {
  const identityRegistry = await publicClient.readContract({ address: lifecycleRegistry, abi: LIFECYCLE_ABI, functionName: "IDENTITY_REGISTRY" });
  const chainId = await publicClient.getChainId();
  const identity = identityOf(chainId, identityRegistry, agentId);
  const record = await publicClient.readContract({ address: lifecycleRegistry, abi: LIFECYCLE_ABI, functionName: "getRecord", args: [BigInt(agentId)] });
  if (!descriptorUrl) {
    const uri = await publicClient.readContract({ address: identityRegistry, abi: IDENTITY_ABI, functionName: "tokenURI", args: [BigInt(agentId)] });
    const file = decodeDataUri(uri);
    const svc = file?.services?.find((s) => s.name === "ALP");
    if (!svc) throw new Error("registration file advertises no ALP service");
    descriptorUrl = svc.endpoint;
  }
  return { chainId, identityRegistry, identity, record, descriptorUrl };
}

/** Checks the unsigned descriptor against L0 (chain record). */
export function checkDescriptor(descriptor, { identity, record }) {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });
  add("descriptor shape", descriptor?.record === "descriptor" && descriptor?.version === "0.4-draft", `${descriptor?.record} ${descriptor?.version}`);
  add("descriptor identity = chain", descriptor?.identity?.agentRegistry === identity.agentRegistry && descriptor?.identity?.agentId === identity.agentId);
  add("descriptor state = chain", descriptor?.state === STATES[record.state], `${descriptor?.state} vs ${STATES[record.state]}`);
  add("not RETIRED", STATES[record.state] !== "RETIRED");
  add("sequence = chain", descriptor?.lifecycle_sequence === record.sequence.toString(), `${descriptor?.lifecycle_sequence} vs ${record.sequence}`);
  add("epoch = chain", descriptor?.authority_epoch === record.authorityEpoch.toString());
  add("policy digest = chain", descriptor?.policy_digest === record.policyDigest.toLowerCase());
  add("handshake endpoint https", isHttpsOrigin(new URL(descriptor?.handshake_endpoint ?? "x:").origin, { allowLocalHttp: INSECURE_LOCAL }), descriptor?.handshake_endpoint);
  return checks;
}

export async function handshake({ descriptor, audience, nonce = randomBytes32(), descriptorDigest = jcsDigest(descriptor) }) {
  const { status, body } = await fetchJson(descriptor.handshake_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audience, nonce, descriptor_digest: descriptorDigest }),
  });
  return { status, body, nonce, descriptorDigest };
}

export function printChecks(title, checks) {
  console.log(`\n${title}`);
  for (const c of checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  — ${c.detail}` : ""}`);
}

async function main() {
  const rpc = arg("rpc", process.env.RPC_URL ?? "https://bsc-dataseed.bnbchain.org");
  const depFile = new URL("../ops/deployment.json", import.meta.url);
  const lifecycleRegistry = getAddress(arg("registry", existsSync(depFile) ? JSON.parse(readFileSync(depFile, "utf8")).address : ""));
  const agentId = BigInt(arg("agent"));
  const audience = arg("audience", "https://verifier.example");
  const publicClient = createPublicClient({ transport: http(rpc) });

  const d = await discover({ publicClient, lifecycleRegistry, agentId, descriptorUrl: arg("descriptor") });
  console.log(`agent #${agentId}  ${d.identity.agentRegistry}  state ${STATES[d.record.state]}  seq ${d.record.sequence}  epoch ${d.record.authorityEpoch}`);
  console.log(`descriptor ${d.descriptorUrl}`);
  const { status, body: descriptor } = await fetchJson(d.descriptorUrl);
  if (status !== 200) throw new Error(`descriptor HTTP ${status}: ${JSON.stringify(descriptor)}`);
  const dChecks = checkDescriptor(descriptor, d);
  printChecks("L0 vs L2 descriptor", dChecks);

  const hs = await handshake({ descriptor, audience });
  if (hs.status !== 200) throw new Error(`handshake HTTP ${hs.status}: ${JSON.stringify(hs.body)}`);
  const v = await verifyHandshakeResponse({
    publicClient, lifecycleRegistry, agentId,
    expected: { identity: d.identity, audience, nonce: hs.nonce, descriptorDigest: hs.descriptorDigest, descriptor, chainId: d.chainId },
    response: hs.body,
  });
  printChecks("handshake", v.checks);
  console.log(`  signer (ECDSA recover) ${v.signer}  wallet snapshot ${d.record.walletSnapshot}`);
  const ok = dChecks.every((c) => c.ok) && v.ok;
  console.log(`\nRESULT ${ok ? "VERIFIED" : "REJECTED"}`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1]?.endsWith("verify.mjs")) {
  main().catch((e) => { console.error("ERROR", e.message); process.exit(2); });
}
