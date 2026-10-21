import "server-only";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { readAgent } from "./chain";
import { ALP_VERSION, BINDING_NAME, LIFECYCLE_REGISTRY, SITE_URL } from "./config";
import { identityOf } from "./alp";
import { manifestDigest } from "./manifest";

/**
 * The showcase agent served by this site: descriptor at /.well-known/alp.json, handshake at
 * /alp/handshake. Its key only signs handshakes; its approved policy allows no spending.
 */
export function showcaseConfig() {
  const id = process.env.SHOWCASE_AGENT_ID;
  const key = process.env.SHOWCASE_AGENT_KEY;
  if (!id || !key || !LIFECYCLE_REGISTRY || !/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  return { agentId: BigInt(id), account: privateKeyToAccount(key as Hex) };
}

export async function showcaseDescriptor() {
  const cfg = showcaseConfig();
  if (!cfg) return null;
  const snap = await readAgent(cfg.agentId);
  const r = snap.record;
  if (!r) return { error: "no lifecycle record" } as const;
  // Fail closed: if the chain no longer binds this key, do not advertise anything.
  if (!snap.wallet || snap.wallet.toLowerCase() !== cfg.account.address.toLowerCase()) return { error: "wallet binding moved" } as const;
  const descriptor = {
    record: "descriptor",
    version: ALP_VERSION,
    identity: identityOf(cfg.agentId),
    state: r.state,
    lifecycle_sequence: r.sequence.toString(),
    authority_epoch: r.authorityEpoch.toString(),
    policy_digest: r.policyDigest.toLowerCase(),
    profiles: ["Core Agent"],
    handshake_endpoint: `${SITE_URL}/alp/handshake`,
    bindings: [{ name: BINDING_NAME, digest: manifestDigest() }],
  };
  return { descriptor, cfg } as const;
}
