import "server-only";
import { toHex, type Hex } from "viem";
import { randomBytes } from "node:crypto";
import { lifecycleAbi, publicClient, readAgent } from "./chain";
import { AGENT_REGISTRY, alpDigest, alpServiceOf, decodeDataUri, identityOf } from "./alp";
import { scanUpstreamChanges, snapshotChecks } from "./checks";
import { BINDING_NAME, IDENTITY_PINS, IDENTITY_REGISTRY, LIFECYCLE_REGISTRY, SITE_URL } from "./config";
import { manifestDigest } from "./manifest";
import { validateRecord } from "./schema";
import { SafeFetchError, resolveUri, safeFetchJson } from "./safe-fetch";
import type { CheckResult } from "@/components/ui";

const REASONS = ["ok", "no record", "retired", "owner changed", "wallet unset or changed", "stale sequence", "stale epoch", "bad time window", "bad signature"];
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

export type VerifyReport = {
  agentId: string;
  agentRegistry: string;
  block: string;
  verdict: "verified" | "verified-not-active" | "failed" | "no-passport";
  summary: string;
  checks: CheckResult[];
  descriptor: unknown;
  handshake: unknown;
};

const msg = (e: unknown) => (e instanceof SafeFetchError ? e.message : (e as Error)?.message ?? String(e));

export async function verifyAgent(agentId: bigint): Promise<VerifyReport> {
  const checks: CheckResult[] = [];
  const add = (c: CheckResult) => checks.push(c);
  const snap = await readAgent(agentId);

  // 0. The upstream registry is still the code we pinned (BSC-02).
  const implWord = await publicClient.getStorageAt({ address: IDENTITY_REGISTRY, slot: IMPL_SLOT });
  const impl = implWord ? (`0x${implWord.slice(26)}` as Hex) : null;
  add({
    id: "pin",
    label: "Identity registry implementation matches the manifest",
    status: impl?.toLowerCase() === IDENTITY_PINS.implementation.toLowerCase() ? "pass" : "fail",
    detail:
      impl?.toLowerCase() === IDENTITY_PINS.implementation.toLowerCase()
        ? `ERC-1967 slot points to ${IDENTITY_PINS.implementation}.`
        : `The ERC-8004 registry was upgraded to ${impl}. Cached compatibility is void until re-validated.`,
    ref: "BSC-02",
  });

  // 1. Registration file.
  let file: unknown = null;
  if (snap.tokenURI) {
    try {
      file = decodeDataUri(snap.tokenURI);
      if (!file) {
        const r = await safeFetchJson(resolveUri(snap.tokenURI));
        file = r.status === 200 ? r.json : null;
      }
    } catch (e) {
      add({ id: "regfile", label: "Registration file readable", status: "fail", detail: msg(e) });
    }
  }

  checks.push(...snapshotChecks(snap, file));
  const r = snap.record;
  if (!snap.exists || !r) {
    return finish("no-passport", "There is no lifecycle record for this agent.");
  }

  // 2. Upstream transfers and wallet changes since the record was last written (F3 / BAP-728 4.3).
  if (!r.retired) {
    try {
      const s = await scanUpstreamChanges(agentId, r.updatedAtBlock, snap.blockNumber);
      const n = s.transfers + s.walletChanges;
      add({
        id: "upstream",
        label: "No transfer or wallet change since the last record",
        status: n > 0 ? "fail" : s.complete ? "pass" : "warn",
        detail:
          n > 0
            ? `${s.transfers} transfer(s), ${s.walletChanges} wallet change(s) since block ${r.updatedAtBlock}. Sessions and delegations must be treated as invalid until the owner re-binds.`
            : s.complete
              ? `Every block from ${r.updatedAtBlock} to ${snap.blockNumber} scanned.`
              : `Last ${(s.scannedTo - s.scannedFrom + 1n).toString()} blocks scanned; older changes are not covered.`,
        ref: "BAP-728 4.3",
      });
    } catch (e) {
      add({ id: "upstream", label: "Transfer history", status: "skip", detail: `Log RPC unavailable: ${msg(e)}` });
    }
  }

  // 3. Descriptor.
  const svc = alpServiceOf(file);
  if (!svc) return finish(null, "The agent does not advertise an ALP descriptor, so the handshake cannot run.");
  let origin: string;
  try {
    const u = new URL(svc.endpoint);
    if (u.protocol !== "https:") throw new Error("descriptor must be https");
    origin = u.origin;
  } catch (e) {
    add({ id: "desc-url", label: "Descriptor URL", status: "fail", detail: msg(e) });
    return finish(null, "The advertised descriptor URL is not usable.");
  }
  const descriptorUrl = `${origin}/.well-known/alp.json`;
  let descriptor: Record<string, unknown> | null = null;
  try {
    const res = await safeFetchJson(descriptorUrl);
    if (res.status !== 200 || !res.json || typeof res.json !== "object") throw new Error(`HTTP ${res.status}`);
    descriptor = res.json as Record<string, unknown>;
    add({ id: "desc-fetch", label: "Descriptor served over HTTPS", status: "pass", detail: descriptorUrl, ref: "ALP-DISC" });
  } catch (e) {
    add({ id: "desc-fetch", label: "Descriptor served over HTTPS", status: "fail", detail: `${descriptorUrl}: ${msg(e)}`, ref: "ALP-DISC" });
    return finish(null, "The descriptor could not be fetched.");
  }

  const shape = validateRecord("A1", descriptor);
  add({
    id: "desc-schema",
    label: "Descriptor matches the A.1 schema",
    status: shape.ok ? "pass" : "fail",
    detail: shape.ok ? "All required fields, no unknown fields." : shape.errors.join("; "),
    ref: "SCHEMA-01",
  });

  const d = descriptor as {
    identity?: { agentRegistry?: string; agentId?: string };
    state?: string;
    lifecycle_sequence?: string;
    authority_epoch?: string;
    policy_digest?: string;
    handshake_endpoint?: string;
    bindings?: { name: string; digest: string }[];
  };
  const idOk = d.identity?.agentRegistry?.toLowerCase() === AGENT_REGISTRY && d.identity?.agentId === agentId.toString();
  add({
    id: "desc-identity",
    label: "Descriptor names this exact identity",
    status: idOk ? "pass" : "fail",
    detail: `${d.identity?.agentRegistry ?? "?"} #${d.identity?.agentId ?? "?"}`,
  });
  const stateOk = d.state === r.state && d.lifecycle_sequence === r.sequence.toString() && d.authority_epoch === r.authorityEpoch.toString();
  add({
    id: "desc-state",
    label: "Descriptor state, sequence and epoch match the chain",
    status: stateOk ? "pass" : "fail",
    detail: `Descriptor ${d.state}/${d.lifecycle_sequence}/${d.authority_epoch}, chain ${r.state}/${r.sequence}/${r.authorityEpoch}. The chain record prevails.`,
    ref: "DISC-03",
  });
  add({
    id: "desc-policy",
    label: "Descriptor policy digest matches the chain",
    status: d.policy_digest === r.policyDigest.toLowerCase() ? "pass" : "fail",
    detail: d.policy_digest ?? "missing",
  });
  const binding = d.bindings?.find((b) => b.name === BINDING_NAME);
  const ourDigest = manifestDigest();
  add({
    id: "desc-binding",
    label: "Descriptor pins this deployment manifest",
    status: binding?.digest === ourDigest ? "pass" : "warn",
    detail: binding ? (binding.digest === ourDigest ? ourDigest : `Pins ${binding.digest}; current manifest is ${ourDigest}.`) : `No ${BINDING_NAME} binding listed.`,
    ref: "BAP-728 4.2",
  });

  // 4. Handshake.
  const endpoint = d.handshake_endpoint;
  if (!endpoint) return finish(null, "No handshake endpoint.");
  const audience = new URL(SITE_URL).origin;
  const nonce = toHex(randomBytes(32));
  const descriptorDigest = alpDigest(descriptor);
  let hs: Record<string, unknown> | null = null;
  try {
    const res = await safeFetchJson(endpoint, { method: "POST", body: { audience, nonce, descriptor_digest: descriptorDigest } });
    if (res.status !== 200 || !res.json || typeof res.json !== "object")
      throw new Error(`HTTP ${res.status} ${res.text.slice(0, 160)}`);
    hs = res.json as Record<string, unknown>;
    add({ id: "hs-fetch", label: "Agent answered a fresh handshake", status: "pass", detail: endpoint });
  } catch (e) {
    add({ id: "hs-fetch", label: "Agent answered a fresh handshake", status: "fail", detail: `${endpoint}: ${msg(e)}` });
    return finish(null, "The handshake endpoint did not answer correctly.", descriptor);
  }

  const hsShape = validateRecord("A2", hs);
  add({ id: "hs-schema", label: "Handshake matches the A.2 schema", status: hsShape.ok ? "pass" : "fail", detail: hsShape.ok ? "Valid." : hsShape.errors.join("; ") });

  const h = hs as {
    identity?: { agentRegistry?: string; agentId?: string };
    audience?: string;
    nonce?: string;
    descriptor_digest?: string;
    lifecycle_sequence?: string;
    authority_epoch?: string;
    issued_at?: number;
    expires_at?: number;
    proof?: string;
  };
  const echo = h.audience === audience && h.nonce === nonce && h.descriptor_digest === descriptorDigest;
  add({
    id: "hs-echo",
    label: "Our audience, nonce and descriptor digest were signed back",
    status: echo ? "pass" : "fail",
    detail: echo ? `Nonce ${nonce.slice(0, 18)}… used once, audience ${audience}.` : "The response does not echo the request exactly.",
    ref: "DISC-02",
  });
  const ttl = Number(h.expires_at) - Number(h.issued_at);
  add({
    id: "hs-ttl",
    label: "Proof lives at most 300 seconds",
    status: ttl > 0 && ttl <= 300 ? "pass" : "fail",
    detail: `${ttl} seconds.`,
  });
  try {
    const [ok, reason] = await publicClient.readContract({
      address: LIFECYCLE_REGISTRY!,
      abi: lifecycleAbi,
      functionName: "verifyHandshake",
      args: [
        agentId,
        String(h.audience ?? ""),
        (h.nonce ?? `0x${"0".repeat(64)}`) as Hex,
        (h.descriptor_digest ?? `0x${"0".repeat(64)}`) as Hex,
        BigInt(h.lifecycle_sequence ?? 0),
        BigInt(h.authority_epoch ?? 0),
        BigInt(h.issued_at ?? 0),
        BigInt(h.expires_at ?? 0),
        (h.proof ?? "0x") as Hex,
      ],
    });
    add({
      id: "hs-chain",
      label: "Signed by the bound agent wallet, checked by the contract",
      status: ok ? "pass" : "fail",
      detail: ok
        ? `verifyHandshake returned ok against the live record (owner, wallet, sequence ${r.sequence}, epoch ${r.authorityEpoch}).`
        : `verifyHandshake refused it: ${REASONS[reason] ?? `reason ${reason}`}.`,
      ref: "DISC-01",
    });
  } catch (e) {
    add({ id: "hs-chain", label: "On-chain handshake check", status: "fail", detail: msg(e), ref: "DISC-01" });
  }
  return finish(null, "", descriptor, hs);

  function finish(force: VerifyReport["verdict"] | null, note: string, desc: unknown = null, hsr: unknown = null): VerifyReport {
    const failed = checks.some((c) => c.status === "fail");
    const handshakeOk = checks.some((c) => c.id === "hs-chain" && c.status === "pass");
    const verdict: VerifyReport["verdict"] =
      force ?? (failed || !handshakeOk ? "failed" : snap.live?.operational ? "verified" : "verified-not-active");
    const summary =
      verdict === "verified"
        ? "Identity verified and the agent is active. This is not a quality review."
        : verdict === "verified-not-active"
          ? `Identity verified, but the agent is ${r?.state ?? "not active"}. Do not send it paid work.`
          : verdict === "no-passport"
            ? note
            : note || "At least one check failed. Do not rely on this agent until it is fixed.";
    return {
      agentId: agentId.toString(),
      agentRegistry: identityOf(agentId).agentRegistry,
      block: snap.blockNumber.toString(),
      verdict,
      summary,
      checks,
      descriptor: desc,
      handshake: hsr,
    };
  }
}
