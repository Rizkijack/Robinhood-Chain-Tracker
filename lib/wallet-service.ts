/**
 * Unified wallet service that abstracts both Privy and Reown providers.
 * Handles wallet operations (balance, signing, transactions) with automatic
 * provider fallback and error recovery.
 */

import { getBalance, sendTransaction, signMessage } from "wagmi/actions";
import { parseEther } from "viem";

export interface WalletAddress {
  address: string;
  via: "privy" | "reown";
  name?: string;
}

export interface WalletBalance {
  address: string;
  balance: string; // in wei
  formatted: string; // human-readable (e.g., "1.5 ETH")
  decimals: number;
  symbol: string;
}

export interface TransactionOptions {
  to: string;
  value: string; // in wei or formatted amount
  data?: string;
  gasLimit?: string;
}

export interface TransactionResult {
  hash: string;
  from: string;
  to: string;
  status: "pending" | "success" | "failed";
}

/**
 * Get the active wallet address and provider source.
 * Returns null if no wallet is connected.
 */
export function getActiveWallet(
  privyAddress: string | null,
  reownAddress: string | null
): WalletAddress | null {
  if (privyAddress) {
    return {
      address: privyAddress,
      via: "privy",
      name: "Privy Wallet",
    };
  }

  if (reownAddress) {
    return {
      address: reownAddress,
      via: "reown",
      name: "Connected Wallet",
    };
  }

  return null;
}

/**
 * Fetch wallet balance from Reown/Wagmi provider.
 * Falls back gracefully if RPC is unavailable.
 */
export async function fetchWalletBalance(
  address: string,
  config: any // wagmi config
): Promise<WalletBalance | null> {
  try {
    const balance = await getBalance(config, {
      address: address as `0x${string}`,
    });

    return {
      address,
      balance: balance.value.toString(),
      formatted: balance.formatted,
      decimals: 18,
      symbol: balance.symbol,
    };
  } catch (error) {
    console.error("[Wallet Service] Failed to fetch balance:", error);
    return null;
  }
}

/**
 * Sign a message with the connected wallet.
 * Routes to appropriate provider (Privy or Reown).
 */
export async function signWalletMessage(
  message: string,
  via: "privy" | "reown",
  signatureProvider?: any // Privy signer or wagmi signer
): Promise<string | null> {
  try {
    if (via === "privy" && signatureProvider?.signMessage) {
      // Privy signing
      const signature = await signatureProvider.signMessage(message);
      return signature;
    } else if (via === "reown") {
      // Reown/Wagmi signing (via useSignMessage)
      if (signatureProvider?.signMessageAsync) {
        const result = await signatureProvider.signMessageAsync({
          message,
        });
        return result;
      }
    }

    console.warn(`[Wallet Service] No signature provider available for ${via}`);
    return null;
  } catch (error) {
    console.error("[Wallet Service] Failed to sign message:", error);
    return null;
  }
}

/**
 * Send a transaction from the connected wallet.
 * Routes to appropriate provider (Privy embedded or Reown).
 */
export async function sendWalletTransaction(
  options: TransactionOptions,
  via: "privy" | "reown",
  config: any, // wagmi config or Privy signer
  fromAddress?: string
): Promise<TransactionResult | null> {
  try {
    const txData = {
      to: options.to as `0x${string}`,
      value: options.value.startsWith("0x")
        ? BigInt(options.value)
        : parseEther(options.value),
      ...(options.data && { data: options.data as `0x${string}` }),
    };

    if (via === "reown" && config) {
      // Reown/Wagmi transaction
      const hash = await sendTransaction(config, {
        ...txData,
        account: fromAddress as `0x${string}`,
      });

      return {
        hash,
        from: fromAddress || "",
        to: options.to,
        status: "pending",
      };
    } else if (via === "privy" && config?.sendTransaction) {
      // Privy embedded wallet transaction
      const txHash = await config.sendTransaction(txData);
      return {
        hash: txHash,
        from: fromAddress || "",
        to: options.to,
        status: "pending",
      };
    }

    console.warn(`[Wallet Service] No transaction provider available for ${via}`);
    return null;
  } catch (error) {
    console.error("[Wallet Service] Failed to send transaction:", error);
    return null;
  }
}

/**
 * Verify if a wallet address is valid (basic Ethereum address check).
 */
export function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Format a wallet address for display (shorten it).
 */
export function formatWalletAddress(
  address: string,
  startChars = 4,
  endChars = 4
): string {
  if (!address) return "";
  return `${address.slice(0, 2 + startChars)}…${address.slice(-endChars)}`;
}

/**
 * Build provider context for wallet operations.
 * Determines which provider should be used based on active wallet.
 */
export function buildWalletContext(
  activeWallet: WalletAddress | null,
  privyWallets?: any[],
  wagmiConfig?: any
) {
  return {
    activeWallet,
    provider: activeWallet?.via,
    privyWallets: privyWallets || [],
    wagmiConfig,
  };
}
