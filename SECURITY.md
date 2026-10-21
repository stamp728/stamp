# Security

Report vulnerabilities privately through GitHub's "Report a vulnerability" button on this repository. You can also write to hello@stamp728.xyz. Please do not open a public issue for anything exploitable.

Scope: `contracts/src/AgentLifecycleRegistry.sol` as deployed at `0x0ab009ab9120842e740b40a7e93ac3bdb46099cc` on BSC mainnet and testnet, the handshake logic in `kit/` and the verifier in `web/src/lib/`.

The contract has no admin and cannot be upgraded or paused, so a confirmed bug is fixed by deploying a new registry and publishing a new binding manifest, not by patching the old one.
