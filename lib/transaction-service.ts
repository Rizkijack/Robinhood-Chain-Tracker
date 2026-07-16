/**
 * Transaction service for building, signing, and sending transactions.
 * Routes transactions through the appropriate provider (Privy or Reown).
 */

import {
  parseEther,
  encodeFunctionData,
  getAddress,
  isAddress,
  createPublicClient,
  http,
  ContractFunctionRevertedError,
} from "viem";
import { ROBINHOOD_RPC_URL } from "@/lib/chains";
import { CHAIN } from "@/lib/constants";

export interface TransactionConfig {
  from: string;
  to: string;
  value: string; // in ETH or wei
  data?: string;
  gasLimit?: string;
}

export interface TransactionEstimate {
  gasLimit: string;
  gasPrice: string;
  totalCost: string; // in ETH
}

export interface TransactionReceipt {
  hash: string;
  from: string;
  to: string;
  status: "pending" | "confirmed" | "failed";
  blockNumber?: number;
  transactionIndex?: number;
  gasUsed?: string;
}

export interface TransactionError {
  code: string;
  message: string;
  reason?: string;
}

// Transaction status cache
const txStatusCache = new Map<
  string,
  { status: TransactionReceipt; timestamp: number }
>();
const TX_CACHE_DURATION = 5_000;

/**
 * Create a public client for transaction monitoring.
 */
function createRobinhoodClient() {
  return createPublicClient({
    chain: {
      id: CHAIN.chainId,
      name: CHAIN.name,
      rpcUrls: {
        default: { http: [ROBINHOOD_RPC_URL] },
      },
    } as any,
    transport: http(ROBINHOOD_RPC_URL),
  });
}

/**
 * Validate transaction configuration.
 */
export function validateTransaction(
  config: TransactionConfig
): { valid: boolean; error?: string } {
  if (!isAddress(config.from)) {
    return { valid: false, error: "Invalid from address" };
  }

  if (!isAddress(config.to)) {
    return { valid: false, error: "Invalid to address" };
  }

  if (config.from.toLowerCase() === config.to.toLowerCase()) {
    return { valid: false, error: "Cannot send to same address" };
  }

  try {
    parseEther(config.value);
  } catch {
    return { valid: false, error: "Invalid value amount" };
  }

  return { valid: true };
}

/**
 * Estimate gas for a transaction.
 */
export async function estimateTransactionGas(
  config: TransactionConfig
): Promise<TransactionEstimate | null> {
  try {
    const client = createRobinhoodClient();

    // Estimate gas
    const gas = await client.estimateGas({
      account: config.from as `0x${string}`,
      to: config.to as `0x${string}`,
      value: config.value.includes(".") ? parseEther(config.value) : BigInt(config.value),
      ...(config.data && { data: config.data as `0x${string}` }),
    });

    // Get gas price
    const gasPrice = await client.getGasPrice();

    const totalCostWei = (gas * gasPrice).toString();
    const totalCostEth = Number(totalCostWei) / 1e18;

    return {
      gasLimit: gas.toString(),
      gasPrice: gasPrice.toString(),
      totalCost: totalCostEth.toFixed(8),
    };
  } catch (error) {
    console.error("[Transaction Service] Gas estimation failed:", error);
    return null;
  }
}

/**
 * Build transaction data with proper encoding.
 */
export function buildTransactionData(
  config: TransactionConfig,
  contractAbi?: any,
  functionName?: string,
  args?: any[]
): TransactionConfig {
  if (contractAbi && functionName && args) {
    const encoded = encodeFunctionData({
      abi: contractAbi,
      functionName,
      args,
    });

    return {
      ...config,
      data: encoded,
      value: "0", // Contract calls are usually non-value transfers
    };
  }

  return config;
}

/**
 * Monitor transaction status.
 */
export async function getTransactionStatus(
  hash: string,
  fromAddress: string
): Promise<TransactionReceipt | null> {
  try {
    // Check cache first
    const cached = txStatusCache.get(hash);
    if (cached && Date.now() - cached.timestamp < TX_CACHE_DURATION) {
      return cached.status;
    }

    const client = createRobinhoodClient();

    // Get transaction receipt
    const receipt = await client.getTransactionReceipt({
      hash: hash as `0x${string}`,
    });

    if (!receipt) {
      return {
        hash,
        from: fromAddress,
        to: receipt?.to || "",
        status: "pending",
      };
    }

    const txReceipt: TransactionReceipt = {
      hash,
      from: receipt.from,
      to: receipt.to || "",
      status: receipt.status === "success" ? "confirmed" : "failed",
      blockNumber: Number(receipt.blockNumber),
      transactionIndex: receipt.transactionIndex,
      gasUsed: receipt.gasUsed.toString(),
    };

    txStatusCache.set(hash, {
      status: txReceipt,
      timestamp: Date.now(),
    });

    return txReceipt;
  } catch (error) {
    console.error("[Transaction Service] Failed to get status:", error);
    return null;
  }
}

/**
 * Wait for transaction confirmation.
 */
export async function waitForTransactionConfirmation(
  hash: string,
  fromAddress: string,
  maxWait = 300_000 // 5 minutes
): Promise<TransactionReceipt | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const status = await getTransactionStatus(hash, fromAddress);

    if (status && status.status !== "pending") {
      return status;
    }

    // Wait 2 seconds before polling again
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  return null;
}

/**
 * Build error object from transaction failure.
 */
export function parseTransactionError(error: unknown): TransactionError {
  if (error instanceof Error) {
    if (error instanceof ContractFunctionRevertedError) {
      return {
        code: "CONTRACT_REVERTED",
        message: error.shortMessage || "Contract execution reverted",
        reason: error.reason,
      };
    }

    if (error.message.includes("rejected")) {
      return {
        code: "USER_REJECTED",
        message: "Transaction was rejected by user",
      };
    }

    if (error.message.includes("insufficient")) {
      return {
        code: "INSUFFICIENT_FUNDS",
        message: "Insufficient balance for transaction",
      };
    }

    if (error.message.includes("gas")) {
      return {
        code: "GAS_ERROR",
        message: "Gas estimation or pricing error",
      };
    }

    return {
      code: "UNKNOWN",
      message: error.message || "Unknown transaction error",
    };
  }

  return {
    code: "UNKNOWN",
    message: "An unknown error occurred",
  };
}

/**
 * Format transaction amount for display.
 */
export function formatTransactionAmount(value: string, decimals = 18): string {
  try {
    const num = Number(value) / Math.pow(10, decimals);
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  } catch {
    return value;
  }
}

/**
 * Build explorer URL for transaction.
 */
export function buildExplorerUrl(txHash: string): string {
  return `${CHAIN.explorer}/tx/${txHash}`;
}

/**
 * Clear transaction cache.
 */
export function clearTransactionCache() {
  txStatusCache.clear();
}
