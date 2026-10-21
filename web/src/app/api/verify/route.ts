import { verifyAgent } from "@/lib/verify";

export const maxDuration = 60;

// Light per-instance throttle: each run makes outbound requests on someone's behalf.
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) return Response.json({ error: "Too many checks. Try again in a minute." }, { status: 429 });
  recent.push(now);
  hits.set(ip, recent);

  let agentId: string | undefined;
  try {
    ({ agentId } = await req.json());
  } catch {
    return Response.json({ error: "Send {\"agentId\": \"123\"}." }, { status: 400 });
  }
  if (!agentId || !/^\d{1,78}$/.test(String(agentId))) return Response.json({ error: "agentId must be a decimal number." }, { status: 400 });
  try {
    const report = await verifyAgent(BigInt(agentId));
    return Response.json(report, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: `Verification could not run: ${(e as Error).message?.split("\n")[0]}` }, { status: 502 });
  }
}
