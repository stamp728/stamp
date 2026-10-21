import Ajv2020 from "ajv/dist/2020";
import schemas from "./spec/schemas.json";

/** The normative ALP v0.4 record schemas (A.1–A.8), unmodified from the BAP-728 assets. */
const ajv = new Ajv2020({ allErrors: true, strict: false });
const ID = "https://stamp.local/alp-0.4-schemas.json";
ajv.addSchema({ ...schemas, $id: ID });

export type RecordKind = "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7" | "A8";

export function validateRecord(kind: RecordKind, value: unknown): { ok: true } | { ok: false; errors: string[] } {
  const v = ajv.getSchema(`${ID}#/$defs/${kind}`);
  if (!v) return { ok: false, errors: [`schema ${kind} missing`] };
  if (v(value)) return { ok: true };
  return {
    ok: false,
    errors: (v.errors ?? []).slice(0, 8).map((e) => `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`),
  };
}
