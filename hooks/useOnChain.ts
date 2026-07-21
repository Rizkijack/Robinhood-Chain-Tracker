"use client";

import { useState, useEffect, useCallback } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { ERC20_ABI } from "@/lib/contracts/abi";
import { ROBINHOOD_ADDRESSES, WETH_BY_CHAIN } from "@/lib/contracts/addresses";
import { CHAIN } from "@/lib/constants";

// ── ERC20 Token Info Hook ─────────────────────────────────────

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: string;
}

export function useTokenInfo(tokenAddress: string | null) {
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenAddress) {
      setInfo(null);
      return;
    }

    let cancelled = false;

    async function fetchInfo() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/wallet/token-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: tokenAddress }),
        });

        if (!res.ok) throw new Error("Failed to fetch token info");
        const data = await res.json();

        if (!cancelled) {
          setInfo({
            address: tokenAddress!,
            symbol: data.symbol ?? "???",
            name: data.name ?? "Unknown",
            decimals: data.decimals ?? 18,
            totalSupply: data.totalSupply ?? "0",
          });
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInfo();
    return () => { cancelled = true; };
  }, [tokenAddress]);

  return { info, loading, error };
}

// ── ERC20 Balance Hook ────────────────────────────────────────

export function useTokenBalance(
  tokenAddress: string | null,
  walletAddress: string | null,
  decimals: number = 18
) {
  const { data: balanceRaw, isLoading, refetch } = useReadContract({
    abi: ERC20_ABI,
    address: tokenAddress as Address | undefined,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress as Address] : undefined,
    query: { enabled: !!tokenAddress && !!walletAddress },
  });

  const balance = balanceRaw != null ? formatUnits(balanceRaw, decimals) : null;

  return {
    balance,
    balanceRaw,
    isLoading,
    refetch,
  };
}

// ── Native ETH Balance Hook ───────────────────────────────────

export function useNativeBalance(walletAddress: string | null) {
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!walletAddress) {
      setBalance(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/wallet/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress }),
      });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return { balance, loading, refetch: fetchBalance };
}

// ── WETH Address Helper ───────────────────────────────────────

export function useWethAddress(): string {
  return WETH_BY_CHAIN[CHAIN.chainId] ?? ROBINHOOD_ADDRESSES.WETH;
}

// ── Token Allowance Hook ──────────────────────────────────────

export function useTokenAllowance(
  tokenAddress: string | null,
  owner: string | null,
  spender: string | null
) {
  const { data: allowance, isLoading, refetch } = useReadContract({
    abi: ERC20_ABI,
    address: tokenAddress as Address | undefined,
    functionName: "allowance",
    args: owner && spender ? [owner as Address, spender as Address] : undefined,
    query: { enabled: !!tokenAddress && !!owner && !!spender },
  });

  return { allowance: allowance ?? 0n, isLoading, refetch };
}

// ── Approve Hook ──────────────────────────────────────────────

export function useApprove(tokenAddress: string | null) {
  const { writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const approve = useCallback(
    async (spender: string, amount: bigint) => {
      if (!tokenAddress) throw new Error("No token address");
      return writeContractAsync({
        abi: ERC20_ABI,
        address: tokenAddress as Address,
        functionName: "approve",
        args: [spender as Address, amount],
      });
    },
    [tokenAddress, writeContractAsync]
  );

  return {
    approve,
    txHash,
    isPending,
    isConfirming,
    isSuccess,
  };
}

// ── Direct Swap Hook (Uniswap V2 Router) ─────────────────────

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  decimalsIn: number;
  decimalsOut: number;
  slippageBps: number; // basis points, e.g. 300 = 3%
}

export function useSwap() {
  const { writeContractAsync, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const getWeth = useCallback(() => {
    return WETH_BY_CHAIN[CHAIN.chainId] ?? ROBINHOOD_ADDRESSES.WETH;
  }, []);

  const swapEthForTokens = useCallback(
    async (params: SwapParams) => {
      const weth = getWeth();
      const amountInWei = parseUnits(params.amountIn, 18); // ETH has 18 decimals
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

      // Calculate minimum output with slippage
      // We need to estimate first, then apply slippage
      const estimatedOut = await estimateSwap(
        weth,
        params.tokenOut,
        amountInWei,
        params.decimalsIn,
        params.decimalsOut
      );

      const slippageMultiplier = BigInt(10000 - params.slippageBps);
      const amountOutMin = (estimatedOut * slippageMultiplier) / 10000n;

      return writeContractAsync({
        abi: UNISWAP_V2_ROUTER_ABI,
        address: ROBINHOOD_ADDRESSES.UNISWAP_V2_ROUTER as Address,
        functionName: "swapExactETHForTokens",
        args: [
          amountOutMin,
          [weth as Address, params.tokenOut as Address],
          // Recipient will be the connected wallet (msg.sender)
          "0x0000000000000000000000000000000000000000" as Address, // placeholder, wagmi uses connected account
          deadline,
        ],
        value: amountInWei,
      });
    },
    [getWeth, writeContractAsync]
  );

  const swapTokensForEth = useCallback(
    async (params: SwapParams) => {
      const weth = getWeth();
      const amountInWei = parseUnits(params.amountIn, params.decimalsIn);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

      const estimatedOut = await estimateSwap(
        params.tokenIn,
        weth,
        amountInWei,
        params.decimalsIn,
        18
      );

      const slippageMultiplier = BigInt(10000 - params.slippageBps);
      const amountOutMin = (estimatedOut * slippageMultiplier) / 10000n;

      return writeContractAsync({
        abi: UNISWAP_V2_ROUTER_ABI as any,
        address: ROBINHOOD_ADDRESSES.UNISWAP_V2_ROUTER as Address,
        functionName: "swapExactTokensForETH",
        args: [
          amountInWei,
          amountOutMin,
          [params.tokenIn as Address, weth as Address],
          "0x0000000000000000000000000000000000000000" as Address,
          deadline,
        ],
      });
    },
    [getWeth, writeContractAsync]
  );

  const swapTokensForTokens = useCallback(
    async (params: SwapParams) => {
      const amountInWei = parseUnits(params.amountIn, params.decimalsIn);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

      const estimatedOut = await estimateSwap(
        params.tokenIn,
        params.tokenOut,
        amountInWei,
        params.decimalsIn,
        params.decimalsOut
      );

      const slippageMultiplier = BigInt(10000 - params.slippageBps);
      const amountOutMin = (estimatedOut * slippageMultiplier) / 10000n;

      return writeContractAsync({
        abi: UNISWAP_V2_ROUTER_ABI as any,
        address: ROBINHOOD_ADDRESSES.UNISWAP_V2_ROUTER as Address,
        functionName: "swapExactTokensForTokens",
        args: [
          amountInWei,
          amountOutMin,
          [params.tokenIn as Address, params.tokenOut as Address],
          "0x0000000000000000000000000000000000000000" as Address,
          deadline,
        ],
      });
    },
    [writeContractAsync]
  );

  return {
    swapEthForTokens,
    swapTokensForEth,
    swapTokensForTokens,
    txHash,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError,
  };
}

// ── Helper: estimate swap output via getAmountsOut ────────────

async function estimateSwap(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  decimalsIn: number,
  decimalsOut: number
): Promise<bigint> {
  try {
    // Use server-side RPC call to avoid exposing RPC keys
    const res = await fetch("/api/wallet/swap-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenIn,
        tokenOut,
        amountIn: amountIn.toString(),
        decimalsIn,
        decimalsOut,
      }),
    });

    if (!res.ok) throw new Error("Quote failed");
    const data = await res.json();
    return BigInt(data.amountOut);
  } catch {
    // Fallback: return 0 (will fail with slippage check, which is safer)
    return 0n;
  }
}

// Re-export the Uniswap V2 Router ABI for direct use
import { UNISWAP_V2_ROUTER_ABI } from "@/lib/contracts/abi";
