"use client";

import type { Abi, Address, Hex, TransactionReceipt, WalletClient } from "viem";
import { publicClient } from "./chain";

/**
 * Simulate first (so a revert shows its reason before the wallet pops up), then send and wait.
 * Returns the receipt only when status is success; a reverted receipt throws.
 */
export async function sendAndWait(
  wallet: WalletClient,
  call: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
  onHash?: (h: Hex) => void,
): Promise<TransactionReceipt> {
  const account = wallet.account!;
  const { request } = await publicClient.simulateContract({ ...call, account } as never);
  const hash = await wallet.writeContract(request as never);
  onHash?.(hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`Transaction ${hash} reverted on chain.`);
  return receipt;
}

export function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
