// Showcase agent, end to end on chain:
//   1. ERC-8004 register(agentURI)               owner (ops)
//   2. setAgentWallet with EIP-712 proof          owner submits, agent wallet signs
//   3. read back getAgentWallet                   must equal the dedicated agent wallet
//   4. lifecycle register -> REGISTERED           owner, policy digest + owner approval + evidence
//   5. (opt-in --activate) controller -> ACTIVE   epoch 1
//
// Default: DRY RUN (prints plan + gas estimate for step 1). Broadcast: --vai with NETWORK=bsc, or a localhost RPC.
// ALP requires a real, reconciled self-funding payment before ACTIVE. This showcase has no provider, so on
// mainnet it stays REGISTERED. --activate exists to exercise the path on a local fork.
//
// env: AGENT_ORIGIN (https origin that serves /.well-known/alp.json and /alp/handshake), AGENT_NAME, AGENT_DESCRIPTION, AGENT_IMAGE
import { join } from "node:path";
import { parseEventLogs, getAddress } from "viem";
import { LIFECYCLE_ABI, IDENTITY_ABI, POLICY_APPROVAL_TYPES, lifecycleDomain, identityOf, jcsDigest, operationIdBytes, newOperationId, evidenceDocument, registrationDataUri, isHttpsOrigin, STATES } from "../kit/alp.mjs";
import { IDENTITY_REGISTRY, OPS_DIR, VAI, clients, loadAccount, loadDeployment, assertBroadcastAllowed, writeJson, costLine, checkpoint, isLocalRpc } from "./lib.mjs";

const ACTIVATE = process.argv.includes("--activate");
const DEMO_DIR = join(OPS_DIR, process.env.NETWORK === "bsc-testnet" ? "demo-testnet" : "demo");
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

const origin = process.env.AGENT_ORIGIN;
if (!origin || !isHttpsOrigin(origin, { allowLocalHttp: isLocalRpc() })) throw new Error("set AGENT_ORIGIN to an https origin (e.g. https://stamp.example)");
const name = process.env.AGENT_NAME ?? "Stamp Showcase Agent";
const description = process.env.AGENT_DESCRIPTION
  ?? "Reference agent for the Stamp lifecycle registry (BAP-728 / ALP v0.4-draft) on BNB Smart Chain. Holds no spending authority.";

const ops = loadAccount("ops");
const agent = loadAccount("agent");
const controller = loadAccount("controller");
const dep = loadDeployment();
const lifecycle = getAddress(dep.address);
const { publicClient, walletFor, chainId } = await clients();
if (dep.chainId !== chainId) throw new Error(`deployment.json is for chain ${dep.chainId}, RPC is ${chainId}`);
// The anvil fork also reports chainId 56: never let a fork deployment leak into a real run.
if (!isLocalRpc() && String(dep.checkpoint?.finality ?? "").startsWith("anvil")) throw new Error("deployment.json is from a local fork — run deploy.mjs on mainnet first");
const lifecycleCode = await publicClient.getCode({ address: lifecycle });
if (!lifecycleCode || lifecycleCode === "0x") throw new Error(`no lifecycle registry code at ${lifecycle} on this RPC`);

const { file: registrationFile, uri: agentURI } = registrationDataUri({ name, description, image: process.env.AGENT_IMAGE ?? "", origin });

console.log(`lifecycle  ${lifecycle}  chain ${chainId}`);
console.log(`owner      ${ops.address}\nagent      ${agent.address}\ncontroller ${controller.address}`);
console.log(`agentURI   ${agentURI.length} bytes, ALP service ${registrationFile.services[0].endpoint}`);
const regGas = await publicClient.estimateContractGas({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "register", args: [agentURI], account: ops.address });
console.log(`step 1 est ${costLine(regGas)}`);

if (!(await assertBroadcastAllowed(publicClient))) {
  console.log("\nDRY RUN — nothing sent. Broadcast with: NETWORK=bsc AGENT_ORIGIN=https://... node demo-agent.mjs --vai");
} else {

const log = { chainId, lifecycleRegistry: lifecycle, identityRegistry: IDENTITY_REGISTRY, owner: ops.address, agentWallet: agent.address, controller: controller.address, steps: [] };
const save = () => writeJson(join(DEMO_DIR, "run.json"), log);

async function send(label, account, request) {
  const hash = await walletFor(account).writeContract({ ...request, account });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  const cp = await checkpoint(publicClient, chainId, receipt);
  log.steps.push({ label, from: account.address, gasUsed: receipt.gasUsed.toString(), checkpoint: cp });
  save();
  console.log(`  ${label.padEnd(28)} ${hash}  gas ${receipt.gasUsed}  ${cp.finality}`);
  return receipt;
}

// 1. ERC-8004 identity
writeJson(join(DEMO_DIR, "registration.json"), registrationFile);
const r1 = await send("erc8004.register", ops, { address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "register", args: [agentURI] });
const [registered] = parseEventLogs({ abi: IDENTITY_ABI, eventName: "Registered", logs: r1.logs });
const agentId = registered.args.agentId;
log.agentId = agentId.toString();
const identity = identityOf(chainId, IDENTITY_REGISTRY, agentId);
log.identity = identity;
console.log(`  agentId ${agentId}  (${identity.agentRegistry})`);

// 2. dedicated wallet proof — signed by the agent key, submitted by the owner
const [, dName, dVersion, dChainId, dVerifying] = await publicClient.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "eip712Domain" });
const deadline = BigInt(Math.floor(Date.now() / 1000) + 240); // registry max is 5 minutes
const walletSig = await agent.signTypedData({
  domain: { name: dName, version: dVersion, chainId: Number(dChainId), verifyingContract: dVerifying },
  types: { AgentWalletSet: [{ name: "agentId", type: "uint256" }, { name: "newWallet", type: "address" }, { name: "owner", type: "address" }, { name: "deadline", type: "uint256" }] },
  primaryType: "AgentWalletSet",
  message: { agentId, newWallet: agent.address, owner: ops.address, deadline },
});
await send("erc8004.setAgentWallet", ops, { address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "setAgentWallet", args: [agentId, agent.address, deadline, walletSig] });

// 3. read back the finalized binding
const readBack = await publicClient.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "getAgentWallet", args: [agentId] });
if (readBack.toLowerCase() !== agent.address.toLowerCase()) throw new Error(`wallet read-back ${readBack} != ${agent.address}`);
if (readBack.toLowerCase() === ops.address.toLowerCase()) throw new Error("agent wallet equals owner — not dedicated");
log.walletReadBack = readBack;
console.log(`  wallet read-back OK ${readBack}`);

// 4. A.3 policy (zero-spend: no autonomous spending authority) + owner approval + lifecycle record
const policyBody = {
  record: "policy",
  version: "0.4-draft",
  identity,
  owner: ops.address,
  policy_version: "1",
  assets: [{
    network: `eip155:${chainId}`,
    asset: USDT_BSC,
    decimals: 18,
    resource: "none",
    resource_unit: "none",
    balance_threshold: "0",
    refill_amount: "0",
    daily_spend_cap: "0",
    balance_floor: "0",
    provider_allowlist: [{
      origin,
      beneficiary: ops.address,
      contract: USDT_BSC,
      selectors: ["0xa9059cbb"],
      max_charge: "0",
      quote_ttl_seconds: 60,
    }],
  }],
};
const policyDigest = jcsDigest(policyBody);
const ownerApproval = await ops.signTypedData({
  domain: lifecycleDomain(chainId, lifecycle),
  types: POLICY_APPROVAL_TYPES,
  primaryType: "ALPPolicyApproval",
  message: { agentRegistry: identity.agentRegistry, agentId: identity.agentId, policyDigest, policyVersion: 1n },
});
const policy = { ...policyBody, owner_approval: ownerApproval };
writeJson(join(DEMO_DIR, "policy.json"), policy);
log.policyDigest = policyDigest;

const regOpId = newOperationId("register", agentId);
const regEvidence = evidenceDocument({
  identity, operationId: regOpId, from: "PROVISIONED", to: "REGISTERED",
  note: "Identity registered, dedicated wallet bound by EIP-712 proof and read back, zero-spend policy approved by owner, descriptor advertised in the registration file.",
  links: log.steps.map((s) => s.checkpoint.transactionHash),
  actor: ops.address,
});
const regEvidenceDigest = jcsDigest(regEvidence);
writeJson(join(DEMO_DIR, "evidence-register.json"), regEvidence);
await send("lifecycle.register", ops, {
  address: lifecycle, abi: LIFECYCLE_ABI, functionName: "register",
  args: [agentId, controller.address, policyDigest, regEvidenceDigest, operationIdBytes(regOpId)],
});
log.registerOperationId = regOpId;

// 5. optional activation
if (ACTIVATE) {
  const rec = await publicClient.readContract({ address: lifecycle, abi: LIFECYCLE_ABI, functionName: "getRecord", args: [agentId] });
  const actOpId = newOperationId("activate", agentId);
  const actEvidence = evidenceDocument({
    identity, operationId: actOpId, from: "REGISTERED", to: "ACTIVE",
    note: isLocalRpc() ? "LOCAL FORK EXERCISE ONLY — no self-funding payment was made." : "Activation.",
    links: [], actor: controller.address,
  });
  writeJson(join(DEMO_DIR, "evidence-activate.json"), actEvidence);
  await send("lifecycle.transition ACTIVE", controller, {
    address: lifecycle, abi: LIFECYCLE_ABI, functionName: "transition",
    args: [agentId, rec.sequence, 4, rec.authorityEpoch + 1n, rec.policyDigest, jcsDigest(actEvidence), operationIdBytes(actOpId)],
  });
}

const fin = await publicClient.readContract({ address: lifecycle, abi: LIFECYCLE_ABI, functionName: "getRecord", args: [agentId] });
log.final = { state: STATES[fin.state], sequence: fin.sequence.toString(), authorityEpoch: fin.authorityEpoch.toString(), controller: fin.controller, walletSnapshot: fin.walletSnapshot, ownerSnapshot: fin.ownerSnapshot, policyDigest: fin.policyDigest };
log.totalGas = log.steps.reduce((a, s) => a + BigInt(s.gasUsed), 0n).toString();
save();
console.log(`\nagent #${agentId} ${STATES[fin.state]} seq ${fin.sequence} epoch ${fin.authorityEpoch}  total ${costLine(log.totalGas)}`);
console.log(`artifacts in ops/demo/`);
}
