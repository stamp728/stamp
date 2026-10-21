# ops — runbook

Scripts que põem o registro de ciclo de vida (BAP-728) na BSC e registram o agente vitrine.
Tudo roda em **DRY RUN** por padrão. Só transmite com `--vai` **e** `NETWORK=bsc` (ou um RPC localhost/anvil).
Nenhum script imprime chave privada; as chaves ficam em `ops/.secrets/` (no `.gitignore`).

```bash
cd ops && npm i && (cd ../kit && npm i)
```

## Custo medido (fork da BSC, 21/10/2026)

| passo | gás | @0,05 gwei | @0,1 gwei |
|---|---|---|---|
| deploy `AgentLifecycleRegistry` | 2.811.554 | 0,000141 BNB | 0,000281 BNB |
| ERC-8004 `register(agentURI)` (URI de ~530 bytes) | 523.272 | 0,000026 | 0,000052 |
| `setAgentWallet` (prova EIP-712) | 50.440 | 0,0000025 | 0,000005 |
| `lifecycle.register` → REGISTERED | 244.108 | 0,000012 | 0,000024 |
| **total da conta `ops`** | **3.629.374** | **0,00018** | **0,00036** |
| (`--activate`, conta `controller`) | 112.696 | 0,0000056 | 0,000011 |

Com folga (gás p90 da BSC ≈ 0,36 gwei + margem 2x): **mandar 0,003 BNB para `ops`**. `controller` não precisa de BNB no mainnet (sem `--activate`).

## Testnet primeiro (BSC testnet, chain 97)

Mesmos scripts, mesmas carteiras. `NETWORK=bsc-testnet` troca RPC, registro ERC-8004 (`0x8004A818…BD9e`, mesma implementação v2.0.0) e arquivos (`deployment-testnet.json`, `demo-testnet/`).

```bash
NETWORK=bsc-testnet node deploy.mjs --vai
NETWORK=bsc-testnet AGENT_ORIGIN=https://<preview> node demo-agent.mjs --vai
```

## Mainnet

```bash
# 1. carteiras (só endereços na tela; não sobrescreve as existentes)
node wallets.mjs

# 2. mandar 0,003 BNB para o endereço "ops"

# 3. conferir (dry run) e depois deployar
NETWORK=bsc node deploy.mjs
NETWORK=bsc node deploy.mjs --vai          # grava ops/deployment.json (checkpoint com fast finality)

# 4. agente vitrine: fica REGISTERED (sem --activate: ALP exige pagamento real antes de ACTIVE)
NETWORK=bsc AGENT_ORIGIN=https://<site> node demo-agent.mjs
NETWORK=bsc AGENT_ORIGIN=https://<site> node demo-agent.mjs --vai   # artefatos em ops/demo/

# 5. verificação de fora (descriptor + handshake + verifyHandshake on-chain)
node ../kit/verify.mjs --agent <agentId>
```

`AGENT_ORIGIN` é a origem que serve `/.well-known/alp.json` e `/alp/handshake` (o site, ou `kit/server.mjs`).
Ela vai gravada no registration file on-chain — conferir antes do `--vai`.

## Ensaio em fork local (o que foi provado)

```bash
anvil --fork-url https://bsc-dataseed.bnbchain.org --chain-id 56 --port 8545 --hardfork cancun --block-time 1
# fundear ops/controller com anvil_setBalance, depois:
RPC_URL=http://127.0.0.1:8545 node deploy.mjs --vai
RPC_URL=http://127.0.0.1:8545 AGENT_ORIGIN=http://localhost:8787 node demo-agent.mjs --vai --activate
cd ../kit
RPC_URL=http://127.0.0.1:8545 LIFECYCLE_REGISTRY=<addr> AGENT_ID=<id> AGENT_ORIGIN=http://localhost:8787 node server.mjs --insecure-local
RPC_URL=http://127.0.0.1:8545 node verify.mjs --agent <id> --registry <addr> --insecure-local
RPC_URL=http://127.0.0.1:8545 node negative.mjs --agent <id> --registry <addr> --insecure-local
```

Resultado guardado em `ops/fork-run/` (marcado "anvil-local, not finality evidence"): verify 17/17 PASS, negativos 15/15.

Armadilhas do fork: o dataseed é nó podado — use `--hardfork cancun` (sem a chamada EIP-2935 que lê estado velho)
e `--block-time 1` (senão o `block.timestamp` fica parado e o handshake cai na janela de tempo).
