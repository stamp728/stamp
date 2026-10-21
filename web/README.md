# web

The Stamp site (Next.js 16, viem). Every status shown is read from BNB Smart Chain at request time; nothing is cached from a database.

```bash
npm i
cp .env.example .env.local
npm run dev
```

| Route | What |
|---|---|
| `/` `/agents` `/agent/[id]` | Home, directory, passport page with live checks and owner/controller actions |
| `/register` | Issue a passport: ERC-8004 identity, wallet proof, lifecycle record |
| `/verify` `/api/verify` | Full verification report for any agent ID |
| `/binding/manifest.json` | BSC binding manifest (registry, code hashes, finality rule, spec hashes) |
| `/.well-known/alp.json` `/alp/handshake` | Showcase agent's ALP-DISC descriptor and handshake endpoint |

Set `NEXT_PUBLIC_NETWORK=bsc-testnet` to run against chain 97.
