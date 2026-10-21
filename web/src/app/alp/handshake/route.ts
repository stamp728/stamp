import { alpDigest, handshakeTypedData } from "@/lib/alp";
import { LIFECYCLE_REGISTRY } from "@/lib/config";
import { showcaseDescriptor } from "@/lib/showcase";

const TTL = 120;
const SKEW = 15;
const HEX32 = /^0x[0-9a-f]{64}$/;

// Nonces seen per audience in this instance. The verifier must also refuse replays on its side;
// this only stops trivially repeated requests to one warm instance.
const seen = new Map<string, number>();

function isOrigin(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 255) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password && u.origin === s;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let body: { audience?: unknown; nonce?: unknown; descriptor_digest?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const { audience, nonce, descriptor_digest } = body;
  if (!isOrigin(audience)) return Response.json({ error: "BAD_AUDIENCE" }, { status: 400 });
  if (typeof nonce !== "string" || !HEX32.test(nonce)) return Response.json({ error: "BAD_NONCE" }, { status: 400 });
  if (typeof descriptor_digest !== "string" || !HEX32.test(descriptor_digest)) return Response.json({ error: "BAD_DIGEST" }, { status: 400 });

  const d = await showcaseDescriptor();
  if (!d) return Response.json({ error: "NOT_HOSTED" }, { status: 404 });
  if ("error" in d) return Response.json({ error: "UNAVAILABLE" }, { status: 503 });
  if (d.descriptor.state === "RETIRED") return Response.json({ error: "RETIRED" }, { status: 409 });
  const current = alpDigest(d.descriptor);
  if (current !== descriptor_digest) return Response.json({ error: "DESCRIPTOR_MISMATCH", current }, { status: 409 });

  const key = `${audience}|${nonce}`;
  const now = Math.floor(Date.now() / 1000);
  for (const [k, exp] of seen) if (exp < now) seen.delete(k);
  if (seen.has(key)) return Response.json({ error: "NONCE_REUSED" }, { status: 409 });
  seen.set(key, now + 600);

  const issuedAt = now - SKEW;
  const expiresAt = issuedAt + TTL;
  const typed = handshakeTypedData(LIFECYCLE_REGISTRY!, {
    agentId: d.descriptor.identity.agentId,
    audience,
    nonce: nonce as `0x${string}`,
    descriptorDigest: descriptor_digest as `0x${string}`,
    lifecycleSequence: BigInt(d.descriptor.lifecycle_sequence),
    authorityEpoch: BigInt(d.descriptor.authority_epoch),
    issuedAt: BigInt(issuedAt),
    expiresAt: BigInt(expiresAt),
  });
  const proof = await d.cfg.account.signTypedData(typed);
  return Response.json(
    {
      record: "handshake",
      version: "0.4-draft",
      identity: d.descriptor.identity,
      audience,
      nonce,
      descriptor_digest,
      lifecycle_sequence: d.descriptor.lifecycle_sequence,
      authority_epoch: d.descriptor.authority_epoch,
      issued_at: issuedAt,
      expires_at: expiresAt,
      proof,
    },
    { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
