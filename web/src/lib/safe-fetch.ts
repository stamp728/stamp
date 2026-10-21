import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * Outbound fetch for URLs that come from untrusted agent registration files.
 * - https only, default port, no userinfo
 * - every resolved address must be public; the connection is pinned to the checked address,
 *   so DNS rebinding between check and connect does not work
 * - no redirects, 6 s timeout, 64 KiB body cap, JSON only
 */
export class SafeFetchError extends Error {}

const MAX_BYTES = 64 * 1024;

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function ipv6Private(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === "::" || x === "::1") return true;
  if (x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb")) return true;
  if (x.startsWith("ff")) return true;
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  if (x.startsWith("64:ff9b:")) return true;
  if (x.startsWith("2001:db8")) return true;
  return false;
}

export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return !ipv4Private(ip);
  if (v === 6) return !ipv6Private(ip);
  return false;
}

export function checkUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SafeFetchError("Not a valid URL.");
  }
  if (u.protocol !== "https:") throw new SafeFetchError("Only https URLs are fetched.");
  if (u.username || u.password) throw new SafeFetchError("URLs with user information are refused.");
  if (u.port && u.port !== "443") throw new SafeFetchError("Only the default https port is allowed.");
  if (isIP(u.hostname.replace(/^\[|\]$/g, ""))) throw new SafeFetchError("Raw IP hosts are refused; use a domain.");
  if (u.hostname === "localhost" || u.hostname.endsWith(".localhost") || u.hostname.endsWith(".internal") || u.hostname.endsWith(".local"))
    throw new SafeFetchError("Local hostnames are refused.");
  return u;
}

async function resolvePublic(host: string): Promise<{ address: string; family: number }> {
  const all = await lookup(host, { all: true, verbatim: true }).catch(() => {
    throw new SafeFetchError(`Could not resolve ${host}.`);
  });
  if (!all.length) throw new SafeFetchError(`Could not resolve ${host}.`);
  for (const a of all) if (!isPublicIp(a.address)) throw new SafeFetchError(`${host} resolves to a private address.`);
  return all[0];
}

export async function safeFetchJson(raw: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<{ status: number; json: unknown; text: string }> {
  const u = checkUrl(raw);
  const pinned = await resolvePublic(u.hostname);
  const dispatcher = new Agent({
    connect: {
      lookup: (_host, _opts, cb) => cb(null, [{ address: pinned.address, family: pinned.family }] as never, undefined as never),
    },
    headersTimeout: 6_000,
    bodyTimeout: 6_000,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6_000);
  try {
    const res = await undiciFetch(u, {
      method: init?.method ?? "GET",
      headers: { accept: "application/json", ...(init?.body !== undefined ? { "content-type": "application/json" } : {}), "user-agent": "StampVerifier/1.0" },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      redirect: "manual",
      signal: ctrl.signal,
      dispatcher,
    });
    if (res.status >= 300 && res.status < 400) throw new SafeFetchError(`Redirects are not followed (HTTP ${res.status}).`);
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new SafeFetchError("Response is larger than 64 KiB.");
        }
        chunks.push(value);
      }
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  } catch (e) {
    if (e instanceof SafeFetchError) throw e;
    if ((e as Error).name === "AbortError") throw new SafeFetchError("Timed out after 6 seconds.");
    throw new SafeFetchError(`Request failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
    dispatcher.close().catch(() => {});
  }
}

/** ipfs:// is served through a public gateway; everything else must be https. */
export function resolveUri(uri: string): string {
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7).replace(/^ipfs\//, "")}`;
  return uri;
}
