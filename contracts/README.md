# contracts

`src/AgentLifecycleRegistry.sol`: the BAP-728 lifecycle registry for BNB Smart Chain. No admin, no upgrades, pinned to one ERC-8004 identity registry at construction.

Build settings (must match to reproduce the deployed code hash `0x83a20ddb…1a07`): solc 0.8.26, via-IR, optimizer 10000 runs, EVM cancun. OpenZeppelin Contracts v5.4.0.

```bash
forge test                                                                      # 54 unit, fuzz and review-regression tests
forge test --match-contract Fork --fork-url https://bsc-dataseed.bnbchain.org   # 6 tests against the live ERC-8004 registry
```

| Test file | Covers |
|---|---|
| `test/AgentLifecycleRegistry.t.sol` | Every state edge, refusals, idempotent operations, handshake, fuzzing |
| `test/AuditFindings.t.sol` | Regressions for internal review findings F1, F2 and F4 |
| `test/Fork.t.sol` | Registration, wallet binding and transfer handling against the real ERC-8004 registry |
