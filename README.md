# Stamp: BAP-728 agent passports on BNB Chain

Stamp is a working implementation of [BAP-728](https://github.com/bnb-chain/BEPs/blob/master/BAPs/BAP-728.md) (Agent Lifecycle Protocol, ALP v0.4-draft) on BNB Smart Chain, built on the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) identity registry.

It answers one question before you pay an AI agent: **who owns it, which wallet it signs with, and is it allowed to work right now?**

- Site: https://stamp728.xyz (mirror: https://agentstamp.vercel.app)
- Testnet preview: https://stamp-testnet.vercel.app

## Live contracts

`AgentLifecycleRegistry` has no admin, no owner and no upgrade path. Source is verified on Sourcify (exact match) on both networks.

| Network | Address | Deploy block |
|---|---|---|
| BSC mainnet (56) | [`0x0ab009ab9120842e740b40a7e93ac3bdb46099cc`](https://bscscan.com/address/0x0ab009ab9120842e740b40a7e93ac3bdb46099cc) | 128955708 |
| BSC testnet (97) | [`0x0ab009ab9120842e740b40a7e93ac3bdb46099cc`](https://testnet.bscscan.com/address/0x0ab009ab9120842e740b40a7e93ac3bdb46099cc) | 138093884 |

It reads identities from the canonical ERC-8004 registries: mainnet `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, testnet `0x8004A818BFB912233c491871b3d84c89A494BD9e`.

Showcase agents: mainnet [#378515](https://stamp728.xyz/agent/378515), testnet #2650.

## How it works

Every agent carries one of four stamps:

| State | Meaning |
|---|---|
| `REGISTERED` | Identity exists and the agent proved its wallet with a signature. Not cleared for paid work. |
| `ACTIVE` | The owner's controller cleared it to work and get paid under an owner-signed policy. |
| `SUSPENDED` | Paused. Anyone can force this if the identity is transferred or the wallet changes while active. |
| `RETIRED` | Terminal. No transition, re-bind, re-register or transfer brings it back. |

The registry also exposes `verifyHandshake`, an EIP-712 check that the party you are talking to holds the agent's wallet key right now (TTL 300 s, clock skew 30 s, ECDSA tried before ERC-1271 so EIP-7702 delegated accounts work).

Full documentation: https://stamp728.xyz/docs. The conformance matrix, including what Stamp does **not** meet, is at https://stamp728.xyz/docs/conformance.

## Repository layout

| Path | What |
|---|---|
| `contracts/` | Foundry project: `AgentLifecycleRegistry.sol`, unit, fuzz, review-regression and mainnet-fork tests |
| `web/` | Next.js site: issue, view, manage and verify passports; binding manifest at `/binding/manifest.json` |
| `kit/` | Reference ALP-DISC agent server, client verifier and 15 adversarial handshake cases |
| `ops/` | Deploy and showcase-agent scripts (viem). Dry run unless `--vai` is passed. Runbook in Portuguese. |

## Reproduce

Requires [Foundry](https://book.getfoundry.sh/) and Node 22+.

```bash
git clone --recurse-submodules https://github.com/stamp728/stamp
cd contracts
forge test                                   # unit, fuzz, review regressions
forge test --match-contract Fork --fork-url https://bsc-dataseed.bnbchain.org   # against the live ERC-8004 registry
```

End to end on a local mainnet fork (deploy, register, bind, stamp, serve, verify, attack):

```bash
anvil --fork-url https://bsc-dataseed.bnbchain.org --chain-id 56 --hardfork cancun --block-time 1
cd ops && npm i && (cd ../kit && npm i)
node deploy.mjs --vai && node demo-agent.mjs --vai --activate
cd ../kit
node server.mjs --insecure-local & node verify.mjs --insecure-local && node negative.mjs --insecure-local
```

Website:

```bash
cd web && npm i
cp .env.example .env.local   # fill in the addresses above
npm run dev
```

## Limits, stated plainly

- **Not externally audited.** The contract had an internal review (findings and fixes are covered by `test/AuditFindings.t.sol`). It holds no funds.
- **A passport proves identity and status, not quality.** Stamp does not judge what an agent does.
- **BAP-728 is a draft.** Stamp implements the registry and discovery parts of the Core Agent profile. Payments (x402), jobs and escrow (ERC-8183) and portable runtimes are not implemented yet.
- **The ERC-8004 registry is upgradeable by its own authority.** The binding manifest pins its implementation and code hash, and Verify fails if it changes.

## Token

A `$STAMP` token is planned and **not launched**. Anything sold as $STAMP before its address appears on the site is not ours.

## License

MIT. See [LICENSE](LICENSE).
