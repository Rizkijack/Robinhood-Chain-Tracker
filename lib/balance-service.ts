/**
 * Balance and asset fetching service.
 * Fetches token balances from on-chain sources with caching.
 */

import { createPublicClient, http, getBalance, multicall } from "viem";
import { ROBINHOOD_RPC_URL } from "@/lib/chains";
import { CHAIN } from "@/lib/constants";

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
}

export interface TokenBalance {
  token: TokenInfo;
  balance: string; // in wei
  formatted: string; // human-readable
  usdValue?: number;
}

export interface PortfolioSummary {
  totalBalance: string;
  totalUSD: number;
  tokens: TokenBalance[];
}

// Cache for balance data
const balanceCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 10_000; // 10 seconds

/**
 * Create a public client for Robinhood Chain RPC.
 */
export function createRobinhoodClient() {
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
 * Get native token balance (ETH on Robinhood).
 */
export async function getNativeBalance(
  address: string
): Promise<TokenBalance | null> {
  try {
    const cacheKey = `native-${address}`;
    const cached = balanceCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    const client = createRobinhoodClient();
    const balanceWei = await client.getBalance({
      address: address as `0x${string}`,
    });

    // Convert to ETH (18 decimals)
    const balanceETH = Number(balanceWei) / 1e18;

    const result: TokenBalance = {
      token: {
        address: "0x0000000000000000000000000000000000000000", // Native token marker
        symbol: "ETH",
        decimals: 18,
        name: "Ether",
      },
      balance: balanceWei.toString(),
      formatted: balanceETH.toFixed(6),
      usdValue: 0, // Would need price oracle
    };

    balanceCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    return result;
  } catch (error) {
    console.error("[Balance Service] Failed to get native balance:", error);
    return null;
  }
}

/**
 * Get ERC-20 token balance.
 * Requires token address and decimals.
 */
export async function getTokenBalance(
  walletAddress: string,
  tokenAddress: string,
  tokenInfo: Omit<TokenInfo, "address">
): Promise<TokenBalance | null> {
  try {
    const cacheKey = `token-${walletAddress}-${tokenAddress}`;
    const cached = balanceCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    const client = createRobinhoodClient();

    // ERC20 balanceOf call
    const balanceCall = {
      address: tokenAddress as `0x${string}`,
      abi: [
        {
          constant: true,
          inputs: [{ name: "_owner", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "balance", type: "uint256" }],
          type: "function",
        },
      ],
      functionName: "balanceOf",
      args: [walletAddress as `0x${string}`],
    };

    const result = await multicall(client, {
      contracts: [balanceCall as any],
      allowFailure: true,
    });

    const balance = result[0]?.result || "0";
    const balanceNum = Number(balance);
    const formatted = (balanceNum / Math.pow(10, tokenInfo.decimals)).toFixed(
      6
    );

    const tokenBalance: TokenBalance = {
      token: {
        address: tokenAddress,
        ...tokenInfo,
      },
      balance: balance.toString(),
      formatted,
      usdValue: 0,
    };

    balanceCache.set(cacheKey, {
      data: tokenBalance,
      timestamp: Date.now(),
    });

    return tokenBalance;
  } catch (error) {
    console.error("[Balance Service] Failed to get token balance:", error);
    return null;
  }
}

/**
 * Get portfolio summary for a wallet.
 * Includes native balance and known token balances.
 */
export async function getPortfolioSummary(
  address: string,
  tokens: TokenInfo[] = []
): Promise<PortfolioSummary | null> {
  try {
    const balances: TokenBalance[] = [];

    // Get native balance
    const nativeBalance = await getNativeBalance(address);
    if (nativeBalance) {
      balances.push(nativeBalance);
    }

    // Get token balances
    for (const token of tokens) {
      const tokenBalance = await getTokenBalance(address, token.address, {
        symbol: token.symbol,
        decimals: token.decimals,
        name: token.name,
      });
      if (tokenBalance && Number(tokenBalance.formatted) > 0) {
        balances.push(tokenBalance);
      }
    }

    // Calculate total
    const totalBalance = balances.reduce(
      (acc, b) => acc + Number(b.formatted),
      0
    );

    return {
      totalBalance: totalBalance.toFixed(6),
      totalUSD: 0, // Would need price oracle
      tokens: balances.filter((b) => Number(b.formatted) > 0),
    };
  } catch (error) {
    console.error("[Balance Service] Failed to get portfolio summary:", error);
    return null;
  }
}

/**
 * Clear balance cache (useful for manual refresh).
 */
export function clearBalanceCache() {
  balanceCache.clear();
}

/**
 * Clear specific wallet cache.
 */
export function clearWalletCache(address: string) {
  for (const [key] of balanceCache.entries()) {
    if (key.includes(address)) {
      balanceCache.delete(key);
    }
  }
}
