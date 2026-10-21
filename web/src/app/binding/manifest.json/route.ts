import { buildManifest, manifestDigest } from "@/lib/manifest";

export async function GET() {
  const manifest = buildManifest();
  return new Response(JSON.stringify(manifest, null, 2) + "\n", {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-alp-manifest-digest": manifestDigest(),
      "access-control-allow-origin": "*",
    },
  });
}
