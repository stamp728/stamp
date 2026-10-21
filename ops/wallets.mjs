// Generates the three local keys. Prints addresses only. Refuses to overwrite existing keys.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SECRETS_DIR } from "./lib.mjs";

const ROLES = {
  ops: "deployer + owner of the showcase agent (ERC-8004 NFT holder)",
  agent: "dedicated agent wallet (bound via setAgentWallet; signs handshakes)",
  controller: "lifecycle controller (activate / suspend / retire)",
};

mkdirSync(SECRETS_DIR, { recursive: true });
for (const [name, role] of Object.entries(ROLES)) {
  const p = join(SECRETS_DIR, `${name}.json`);
  if (existsSync(p)) {
    const { address } = JSON.parse(readFileSync(p, "utf8"));
    console.log(`${name.padEnd(10)} ${address}  (exists, kept) — ${role}`);
    continue;
  }
  const pk = generatePrivateKey();
  const address = privateKeyToAccount(pk).address;
  writeFileSync(p, JSON.stringify({ address, privateKey: pk }, null, 2), { mode: 0o600 });
  console.log(`${name.padEnd(10)} ${address}  (new) — ${role}`);
}
