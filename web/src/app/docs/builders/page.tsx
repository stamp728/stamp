import type { Metadata } from "next";
import Link from "next/link";
import { LIFECYCLE_REGISTRY } from "@/lib/config";

export const metadata: Metadata = { title: "For agent builders" };

const REG = LIFECYCLE_REGISTRY ?? "0xLifecycleRegistry";

const SERVER = `// alp-server.mjs — Node 20+, npm i viem canonicalize
import http from "node:http";
import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { createPublicClient, http as rpc, parseAbi } from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const AGENT_ID = 123n;                       // your ERC-8004 agent id
const ORIGIN = "https://agent.example.com";  // where this server is reachable
const LIFECYCLE = "${REG}";
const IDENTITY = "eip155:56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432";
const BINDING_DIGEST = "<sha256 of the Stamp manifest, see below>";
// The bound agent wallet. Load it from a secrets manager, never from model-visible memory.
const agent = privateKeyToAccount(process.env.AGENT_KEY);

const chain = createPublicClient({ chain: bsc, transport: rpc() });
const abi = parseAbi([
  "struct Record { address controller; uint64 sequence; uint8 state; bool retired; address ownerSnapshot; uint64 authorityEpoch; address walletSnapshot; uint64 updatedAtBlock; bytes32 evidence; bytes32 policyDigest; }",
  "function getRecord(uint256) view returns (Record)",
]);
const STATES = ["NONE","DRAFT","PROVISIONED","REGISTERED","ACTIVE","SUSPENDED","RETIRED"];
const digest = (o) => "0x" + createHash("sha256").update(canonicalize(o)).digest("hex");

async function descriptor() {
  const r = await chain.readContract({ address: LIFECYCLE, abi, functionName: "getRecord", args: [AGENT_ID] });
  if (r.walletSnapshot.toLowerCase() !== agent.address.toLowerCase()) throw new Error("wallet binding moved");
  return {
    record: "descriptor", version: "0.4-draft",
    identity: { agentRegistry: IDENTITY, agentId: AGENT_ID.toString() },
    state: STATES[r.state],
    lifecycle_sequence: r.sequence.toString(),
    authority_epoch: r.authorityEpoch.toString(),
    policy_digest: r.policyDigest,
    profiles: ["Core Agent"],
    handshake_endpoint: ORIGIN + "/alp/handshake",
    bindings: [{ name: "stamp-bsc-mainnet", digest: BINDING_DIGEST }],
  };
}

const used = new Set(); // nonce per audience, keep it in shared storage in production
const HEX32 = /^0x[0-9a-f]{64}$/;

http.createServer(async (req, res) => {
  const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  try {
    if (req.method === "GET" && req.url === "/.well-known/alp.json") return send(200, await descriptor());
    if (req.method === "POST" && req.url === "/alp/handshake") {
      let raw = ""; for await (const c of req) raw += c;
      const { audience, nonce, descriptor_digest } = JSON.parse(raw);
      const u = new URL(audience);
      if (u.protocol !== "https:" || u.origin !== audience) return send(400, { error: "BAD_AUDIENCE" });
      if (!HEX32.test(nonce) || !HEX32.test(descriptor_digest)) return send(400, { error: "BAD_INPUT" });
      const d = await descriptor();
      if (digest(d) !== descriptor_digest) return send(409, { error: "DESCRIPTOR_MISMATCH" });
      if (used.has(audience + nonce)) return send(409, { error: "NONCE_REUSED" });
      used.add(audience + nonce);
      const issuedAt = Math.floor(Date.now() / 1000) - 15, expiresAt = issuedAt + 120;
      const proof = await agent.signTypedData({
        domain: { name: "Agent Lifecycle Protocol", version: "0.4", chainId: 56, verifyingContract: LIFECYCLE },
        types: { ALPHandshake: [
          { name: "agentRegistry", type: "string" }, { name: "agentId", type: "string" },
          { name: "audience", type: "string" }, { name: "nonce", type: "bytes32" },
          { name: "descriptorDigest", type: "bytes32" }, { name: "lifecycleSequence", type: "uint256" },
          { name: "authorityEpoch", type: "uint256" }, { name: "issuedAt", type: "uint256" },
          { name: "expiresAt", type: "uint256" } ] },
        primaryType: "ALPHandshake",
        message: { agentRegistry: IDENTITY, agentId: AGENT_ID.toString(), audience, nonce,
          descriptorDigest: descriptor_digest, lifecycleSequence: BigInt(d.lifecycle_sequence),
          authorityEpoch: BigInt(d.authority_epoch), issuedAt: BigInt(issuedAt), expiresAt: BigInt(expiresAt) },
      });
      return send(200, { record: "handshake", version: "0.4-draft", identity: d.identity, audience, nonce,
        descriptor_digest, lifecycle_sequence: d.lifecycle_sequence, authority_epoch: d.authority_epoch,
        issued_at: issuedAt, expires_at: expiresAt, proof });
    }
    send(404, { error: "NOT_FOUND" });
  } catch (e) { send(503, { error: "UNAVAILABLE" }); }
}).listen(8787);`;

const CLIENT = `import { createPublicClient, http, parseAbi } from "viem";
import { bsc } from "viem/chains";

const chain = createPublicClient({ chain: bsc, transport: http() });
const stamp = parseAbi([
  "function liveStatus(uint256) view returns (uint8 state, bool ownerMatches, bool walletMatches, bool operational)",
  "function verifyHandshake(uint256,string,bytes32,bytes32,uint256,uint256,uint256,uint256,bytes) view returns (bool ok, uint8 reason)",
]);

// 1. Is the agent open for paid work right now?
const [, , , operational] = await chain.readContract({
  address: "${REG}", abi: stamp, functionName: "liveStatus", args: [agentId],
});

// 2. After you sent {audience, nonce, descriptor_digest} and got the A.2 response "h":
//    check the echo yourself (audience, nonce, digest), then let the contract check the rest.
const [ok, reason] = await chain.readContract({
  address: "${REG}", abi: stamp, functionName: "verifyHandshake",
  args: [agentId, h.audience, h.nonce, h.descriptor_digest, BigInt(h.lifecycle_sequence),
         BigInt(h.authority_epoch), BigInt(h.issued_at), BigInt(h.expires_at), h.proof],
});
// reason: 0 ok, 1 no record, 2 retired, 3 owner changed, 4 wallet changed,
//         5 stale sequence, 6 stale epoch, 7 bad time window, 8 bad signature`;

export default function Page() {
  return (
    <>
      <h1 className="font-serif text-5xl leading-tight tracking-tight">For agent builders</h1>
      <p className="mt-4 text-lg">
        Issuing the passport takes a few minutes on the <Link href="/register">Issue page</Link>. To let clients verify
        your agent, it also needs to answer two requests. This page has everything for both.
      </p>

      <h2>Before you start</h2>
      <ul>
        <li>
          <strong>Two wallets.</strong> An owner wallet you keep safe, and a fresh wallet the agent signs with. BAP-728
          forbids using the owner as the agent wallet, and the contract enforces it.
        </li>
        <li>
          <strong>A controller.</strong> The key or service that activates and suspends the agent. It can be the owner. It
          cannot be the agent wallet.
        </li>
        <li>
          <strong>Already on ERC-8004?</strong> Agents registered with the BNBAgent SDK on BSC mainnet work as they are.
          Pick &quot;I already have an ERC-8004 ID&quot; and Stamp adds the ALP service to your registration file if it is
          stored on chain.
        </li>
      </ul>

      <h2>1. Serve the descriptor</h2>
      <p>
        <code>GET https://your-agent/.well-known/alp.json</code> returns an A.1 descriptor built live from the chain
        record: state, sequence, epoch and policy digest must equal what <code>getRecord</code> returns, or verifiers
        reject it. Build it on request, not at deploy time.
      </p>
      <p>
        The <code>bindings</code> entry pins this deployment: name <code>stamp-bsc-mainnet</code>, digest = SHA-256 of the
        RFC 8785 canonical JSON of <a href="/binding/manifest.json">the manifest</a>. The manifest response also carries
        the digest in the <code>x-alp-manifest-digest</code> header.
      </p>

      <h2>2. Answer the handshake</h2>
      <p>
        <code>POST https://your-agent/alp/handshake</code> with <code>{"{audience, nonce, descriptor_digest}"}</code>. Refuse
        a digest that does not match your current descriptor, refuse a nonce you have seen for that audience, and sign the
        EIP-712 <code>ALPHandshake</code> with the agent wallet. The proof may live at most 300 seconds; 120 is a good
        default. Stamp the issue time about 15 seconds in the past: the contract compares it with the latest block, which
        trails wall clock.
      </p>
      <p>A complete server, about 70 lines:</p>
      <pre>
        <code>{SERVER}</code>
      </pre>
      <p>
        Keep the agent key in a signer the model cannot read. A handshake proves identity only; it must never unlock
        spending by itself.
      </p>

      <h2>3. Check it</h2>
      <p>
        Open <Link href="/verify">Verify</Link> and enter your agent ID. It fetches your descriptor, sends a fresh nonce
        and runs the signature through the contract. Every check that fails says why.
      </p>

      <h2>Verifying other agents in your code</h2>
      <pre>
        <code>{CLIENT}</code>
      </pre>
      <p>
        Also refuse an agent whose ERC-8004 token was transferred or whose wallet changed since its record was last
        written, even if the values look the same again: scan <code>Transfer</code> and <code>MetadataSet</code> on the
        identity registry from the record&apos;s <code>updatedAtBlock</code>. The Verify page does this for you.
      </p>

      <h2>Activating</h2>
      <p>
        Leave the agent Registered until it has made one real payment on its funding rail and the provider has credited
        it. Then the controller stamps Active with a new authority epoch from its lease service and attaches the payment
        and receipt as evidence. Stamp does not move money and does not check payments; the evidence hash makes your claim
        permanent, and your counterparties decide whether to accept it.
      </p>
    </>
  );
}
