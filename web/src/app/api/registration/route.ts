import { NextRequest } from "next/server";
import { SafeFetchError, resolveUri, safeFetchJson } from "@/lib/safe-fetch";

/** Fetches an off-chain ERC-8004 registration file for the browser, through the SSRF guard. */
export async function GET(req: NextRequest) {
  const uri = req.nextUrl.searchParams.get("uri") ?? "";
  if (!uri || uri.length > 2048) return Response.json({ error: "Missing uri." }, { status: 400 });
  try {
    const { status, json } = await safeFetchJson(resolveUri(uri));
    if (status !== 200) return Response.json({ error: `Registration file returned HTTP ${status}.` }, { status: 502 });
    if (!json || typeof json !== "object") return Response.json({ error: "Registration file is not JSON." }, { status: 502 });
    return Response.json({ file: json }, { headers: { "cache-control": "public, max-age=60" } });
  } catch (e) {
    const msg = e instanceof SafeFetchError ? e.message : "Could not fetch the registration file.";
    return Response.json({ error: msg }, { status: 502 });
  }
}
