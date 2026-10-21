import { showcaseDescriptor } from "@/lib/showcase";
import { connection } from "next/server";

export async function GET() {
  await connection();
  const d = await showcaseDescriptor();
  if (!d) return Response.json({ error: "This site does not host an agent." }, { status: 404 });
  if ("error" in d) return Response.json({ error: `Unavailable: ${d.error}` }, { status: 503 });
  return new Response(JSON.stringify(d.descriptor), {
    headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" },
  });
}
