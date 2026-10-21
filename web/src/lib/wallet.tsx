"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createWalletClient, custom, getAddress, type Address, type EIP1193Provider, type WalletClient } from "viem";
import { CHAIN, CHAIN_ID, EXPLORER, NETWORK_LABEL, RPC_URLS } from "./config";

type Announced = { info: { uuid: string; name: string; icon: string; rdns: string }; provider: EIP1193Provider };

type WalletState = {
  providers: Announced[];
  account: Address | null;
  chainId: number | null;
  walletName: string | null;
  connect: (p?: Announced) => Promise<Address>;
  disconnect: () => void;
  ensureChain: () => Promise<void>;
  client: () => WalletClient;
  provider: EIP1193Provider | null;
};

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<Announced[]>([]);
  const [active, setActive] = useState<Announced | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  // EIP-6963: every installed wallet announces itself; no window.ethereum race.
  useEffect(() => {
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<Announced>).detail;
      setProviders((prev) => (prev.some((p) => p.info.uuid === d.info.uuid) ? prev : [...prev, d]));
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);

  useEffect(() => {
    const p = active?.provider;
    if (!p?.on) return;
    const onAccounts = (accs: unknown) => {
      const a = (accs as string[])[0];
      setAccount(a ? getAddress(a) : null);
    };
    const onChain = (id: unknown) => setChainId(Number(id));
    p.on("accountsChanged", onAccounts as never);
    p.on("chainChanged", onChain as never);
    return () => {
      p.removeListener?.("accountsChanged", onAccounts as never);
      p.removeListener?.("chainChanged", onChain as never);
    };
  }, [active]);

  const connect = useCallback(
    async (chosen?: Announced) => {
      let target = chosen ?? active ?? providers[0] ?? null;
      if (!target) {
        const injected = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
        if (!injected) throw new Error("No browser wallet found. Install MetaMask, Rabby, Trust or OKX Wallet.");
        target = { info: { uuid: "injected", name: "Browser wallet", icon: "", rdns: "injected" }, provider: injected };
      }
      const accs = (await target.provider.request({ method: "eth_requestAccounts" })) as string[];
      const id = (await target.provider.request({ method: "eth_chainId" })) as string;
      setActive(target);
      setChainId(Number(id));
      const a = getAddress(accs[0]);
      setAccount(a);
      return a;
    },
    [active, providers],
  );

  const ensureChain = useCallback(async () => {
    const p = active?.provider;
    if (!p) throw new Error("Connect a wallet first.");
    const id = Number(await p.request({ method: "eth_chainId" }));
    if (id === CHAIN_ID) return;
    const hex = `0x${CHAIN_ID.toString(16)}` as const;
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (err) {
      if ((err as { code?: number }).code !== 4902) throw err;
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: NETWORK_LABEL,
            nativeCurrency: { name: "BNB", symbol: CHAIN_ID === 97 ? "tBNB" : "BNB", decimals: 18 },
            rpcUrls: [RPC_URLS[0]],
            blockExplorerUrls: [EXPLORER],
          },
        ],
      });
    }
    setChainId(CHAIN_ID);
  }, [active]);

  const client = useCallback(() => {
    if (!active || !account) throw new Error("Connect a wallet first.");
    return createWalletClient({ account, chain: CHAIN, transport: custom(active.provider) });
  }, [active, account]);

  const value = useMemo<WalletState>(
    () => ({
      providers,
      account,
      chainId,
      walletName: active?.info.name ?? null,
      connect,
      disconnect: () => {
        setActive(null);
        setAccount(null);
      },
      ensureChain,
      client,
      provider: active?.provider ?? null,
    }),
    [providers, account, chainId, active, connect, ensureChain, client],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}

/** Turns wallet / RPC errors into one readable sentence. */
export function errorText(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string; code?: number; details?: string };
  if (e?.code === 4001) return "You rejected the request in your wallet.";
  const m = e?.shortMessage || e?.details || e?.message || String(err);
  return m.split("\n")[0].slice(0, 280);
}
