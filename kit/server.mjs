// Reference ALP-DISC agent endpoint: GET /.well-known/alp.json and POST /alp/handshake.
// Config (env): RPC_URL, LIFECYCLE_REGISTRY, AGENT_ID, AGENT_ORIGIN, AGENT_KEY_FILE, DEPLOYMENT_FILE | BINDING_DIGEST, PORT.
// The signing key is only read here and only used through a viem account; it is never logged.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createPublicClient, http, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  LIFECYCLE_ABI, IDENTITY_ABI, buildDescriptor, identityOf, jcsDigest, signHandshake, isHttpsOrigin,
} from "./alp.mjs";

const INSECURE_LOCAL = process.argv.includes("--insecure-local");
const env = (k, d) => process.env[k] ?? d ?? (() => { throw new Error(`missing env ${k}`); })();

const rpc = env("RPC_URL", "https://bsc-dataseed.bnbchain.org");
const lifecycleRegistry = getAddress(env("LIFECYCLE_REGISTRY"));
const agentId = BigInt(env("AGENT_ID"));
const origin = env("AGENT_ORIGIN");
if (!isHttpsOrigin(origin, { allowLocalHttp: INSECURE_LOCAL })) throw new Error("AGENT_ORIGIN must be an https origin");
const keyFile = env("AGENT_KEY_FILE", new URL("../ops/.secrets/agent.json", import.meta.url));
const account = privateKeyToAccount(JSON.parse(readFileSync(keyFile, "utf8")).privateKey);
const bindingDigest = process.env.BINDING_DIGEST
  ?? jcsDigest(JSON.parse(readFileSync(env("DEPLOYMENT_FILE", new URL("../ops/deployment.json", import.meta.url)), "utf8")));

const publicClient = createPublicClient({ transport: http(rpc, { timeout: 15_000 }) });
const chainId = await publicClient.getChainId();
const identityRegistry = await publicClient.readContract({ address: lifecycleRegistry, abi: LIFECYCLE_ABI, functionName: "IDENTITY_REGISTRY" });
const identity = identityOf(chainId, identityRegistry, agentId);

// Nonces are single-use per audience (ALP-DISC). Entries expire with the max TTL window.
const used = new Map();
function consumeNonce(audience, nonce) {
  const now = Date.now();
  for (const [k, t] of used) if (now - t > 600_000) used.delete(k);
  const k = `${audience}|${nonce}`;
  if (used.has(k)) return false;
  used.set(k, now);
  return true;
}

async function liveDescriptor() {
  const [record, wallet, owner] = await Promise.all([
    publicClient.readContract({ address: lifecycleRegistry, abi: LIFECYCLE_ABI, functionName: "getRecord", args: [agentId] }),
    publicClient.readContract({ address: identityRegistry, abi: IDENTITY_ABI, functionName: "getAgentWallet", args: [agentId] }),
    publicClient.readContract({ address: identityRegistry, abi: IDENTITY_ABI, functionName: "ownerOf", args: [agentId] }),
  ]);
  if (record.state === 0) throw Object.assign(new Error("no lifecycle record"), { code: "NOT_REGISTERED" });
  // Fail closed: if the chain binding moved away from this key or owner, we are not this agent anymore.
  const bound = wallet.toLowerCase() === account.address.toLowerCase() && wallet.toLowerCase() === record.walletSnapshot.toLowerCase()
    && owner.toLowerCase() === record.ownerSnapshot.toLowerCase();
  const descriptor = buildDescriptor({ identity, record, handshakeEndpoint: `${origin}/alp/handshake`, bindingDigest });
  return { descriptor, bound };
}

function send(res, status, body) {
  const s = JSON.stringify(body, null, 2);
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" });
  res.end(s);
}

async function readJson(req, limit = 4096) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error("body too large"), { code: "TOO_LARGE" });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://x").pathname;
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST", "access-control-allow-headers": "content-type" });
      return res.end();
    }
    if (req.method === "GET" && path === "/.well-known/alp.json") {
      const { descriptor, bound } = await liveDescriptor();
      if (!bound) return send(res, 503, { error: "UNAVAILABLE", detail: "on-chain binding no longer matches this runtime" });
      return send(res, 200, descriptor);
    }
    if (req.method === "POST" && path === "/alp/handshake") {
      const body = await readJson(req);
      const { descriptor, bound } = await liveDescriptor();
      if (!bound) return send(res, 503, { error: "UNAVAILABLE", detail: "on-chain binding no longer matches this runtime" });
      if (typeof body?.nonce === "string" && typeof body?.audience === "string" && !consumeNonce(body.audience, body.nonce)) {
        return send(res, 409, { error: "NONCE_REUSED" });
      }
      const a2 = await signHandshake({ account, chainId, lifecycleRegistry, identity, descriptor, request: body, allowLocalHttp: INSECURE_LOCAL });
      return send(res, 200, a2);
    }
    send(res, 404, { error: "NOT_FOUND" });
  } catch (e) {
    const status = e.code === "DESCRIPTOR_MISMATCH" ? 409 : e.code === "NOT_REGISTERED" || e.code === "RETIRED" ? 503 : e.code ? 400 : 500;
    send(res, status, { error: e.code ?? "INTERNAL", detail: e.message, ...(e.current ? { current_digest: e.current } : {}) });
  }
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => {
  console.log(`alp agent #${agentId} (${identity.agentRegistry}) wallet ${account.address}`);
  console.log(`listening on :${port}  origin ${origin}${INSECURE_LOCAL ? "  [insecure-local]" : ""}`);
});
