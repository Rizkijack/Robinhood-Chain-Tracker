"use client";

/**
 * Direct on-chain swap via Uniswap V2 Router contract.
 * Replaces the iframe-based UniswapSwapWidget with real contract interaction.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAccount } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { useSwap, useNativeBalance, useTokenBalance, useTokenInfo } from "@/hooks/useOnChain";
import { ROBINHOOD_ADDRESSES, WETH_BY_CHAIN } from "@/lib/contracts/addresses";
import { CHAIN } from "@/lib/constants";
import { formatUsd } from "@/lib/format";
import { shortenAddress } from "@/lib/wallet";

type SwapDirection = "eth-to-token" | "token-to-eth" | "token-to-token";

export function DirectSwap({
  tokenAddress,
  tokenSymbol,
  tokenPriceUsd,
}: {
  tokenAddress: string;
  tokenSymbol?: string;
  tokenPriceUsd?: number | null;
}) {
  const { address: wallet, isConnected } = useAccount();
  const { balance: ethBalance, refetch: refetchEth } = useNativeBalance(wallet ?? null);
  const { info: tokenInfo } = useTokenInfo(tokenAddress);
  const { balance: tokenBalance, refetch: refetchToken } = useTokenBalance(
    tokenAddress,
    wallet ?? null,
    tokenInfo?.decimals ?? 18
  );

  const {
    swapEthForTokens,
    swapTokensForEth,
    swapTokensForTokens,
    txHash,
    isPending,
    isConfirming,
    isSuccess,
    error: swapError,
  } = useSwap();

  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState(3); // 3% default
  const [direction, setDirection] = useState<SwapDirection>("eth-to-token");
  const [estimatedOut, setEstimatedOut] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const weth = WETH_BY_CHAIN[CHAIN.chainId] ?? ROBINHOOD_ADDRESSES.WETH;

  // Auto-select direction based on token
  useEffect(() => {
    if (tokenAddress.toLowerCase() === weth.toLowerCase()) {
      setDirection("token-to-eth"); // Can't swap ETH for WETH via this UI
    } else {
      setDirection("eth-to-token");
    }
  }, [tokenAddress, weth]);

  // Get quote when amount changes
  useEffect(() => {
    if (!amountIn || Number(amountIn) <= 0) {
      setEstimatedOut(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const decimalsIn = direction === "eth-to-token" ? 18 : (tokenInfo?.decimals ?? 18);
        const amountInWei = parseUnits(amountIn, decimalsIn);

        let path: string[];
        if (direction === "eth-to-token") {
          path = [weth.toLowerCase(), tokenAddress.toLowerCase()];
        } else {
          path = [tokenAddress.toLowerCase(), weth.toLowerCase()];
        }

        const res = await fetch("/api/wallet/swap-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenIn: path[0],
            tokenOut: path[1],
            amountIn: amountInWei.toString(),
            decimalsIn,
            decimalsOut: 18,
          }),
        });

        if (!res.ok) throw new Error("Quote failed");
        const data = await res.json();

        if (!cancelled) {
          const decimalsOut = direction === "eth-to-token" ? 18 : 18;
          const out = formatUnits(BigInt(data.amountOut), decimalsOut);
          setEstimatedOut(out);
        }
      } catch {
        if (!cancelled) setEstimatedOut(null);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 500); // Debounce 500ms

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [amountIn, direction, tokenAddress, tokenInfo, weth]);

  const handleSwap = useCallback(async () => {
    if (!amountIn || Number(amountIn) <= 0) return;
    setTxError(null);

    try {
      if (direction === "eth-to-token") {
        await swapEthForTokens({
          tokenIn: weth,
          tokenOut: tokenAddress,
          amountIn,
          decimalsIn: 18,
          decimalsOut: tokenInfo?.decimals ?? 18,
          slippageBps: slippage * 100,
        });
      } else {
        await swapTokensForEth({
          tokenIn: tokenAddress,
          tokenOut: weth,
          amountIn,
          decimalsIn: tokenInfo?.decimals ?? 18,
          decimalsOut: 18,
          slippageBps: slippage * 100,
        });
      }
    } catch (e: any) {
      setTxError(e?.message?.includes("User rejected") ? "Transaction rejected" : String(e));
    }
  }, [amountIn, direction, weth, tokenAddress, tokenInfo, slippage, swapEthForTokens, swapTokensForEth, swapTokensForTokens]);

  // Reset on success
  useEffect(() => {
    if (isSuccess) {
      setAmountIn("");
      setEstimatedOut(null);
      refetchEth();
      refetchToken();
    }
  }, [isSuccess, refetchEth, refetchToken]);

  if (!isConnected) {
    return (
      <div className="swap-connect-prompt">
        <p className="muted">Connect your wallet to swap tokens directly on-chain.</p>
        <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          Direct swap uses Uniswap V2 Router smart contract — no iframe needed.
        </p>
      </div>
    );
  }

  const ethBalNum = ethBalance ? parseFloat(ethBalance) : 0;
  const tokenBalNum = tokenBalance ? parseFloat(tokenBalance) : 0;
  const amountNum = amountIn ? parseFloat(amountIn) : 0;

  const insufficientBalance =
    direction === "eth-to-token"
      ? amountNum > ethBalNum
      : amountNum > tokenBalNum;

  const estimatedUsd =
    estimatedOut && tokenPriceUsd
      ? parseFloat(estimatedOut) * tokenPriceUsd
      : null;

  return (
    <div className="direct-swap">
      <div className="swap-header">
        <span className="dsection-title">Swap</span>
        <button
          type="button"
          className="swap-dir-btn"
          onClick={() =>
            setDirection((d) =>
              d === "eth-to-token" ? "token-to-eth" : "eth-to-token"
            )
          }
          title="Switch direction"
        >
          ⇅
        </button>
      </div>

      {/* Direction indicator */}
      <div className="swap-pair">
        <span className={`swap-pair-item ${direction === "eth-to-token" ? "active" : ""}`}>
          {CHAIN.nativeGas}
        </span>
        <span className="swap-pair-arrow">→</span>
        <span className={`swap-pair-item ${direction === "token-to-eth" ? "active" : ""}`}>
          {tokenSymbol || "TOKEN"}
        </span>
      </div>

      {/* Input */}
      <div className="swap-input-group">
        <label className="swap-label">
          {direction === "eth-to-token" ? `Pay (${CHAIN.nativeGas})` : `Pay (${tokenSymbol})`}
        </label>
        <div className="swap-input-wrap">
          <input
            className="swap-input"
            type="number"
            step="any"
            min="0"
            placeholder="0.0"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
          />
          <button
            type="button"
            className="swap-max-btn"
            onClick={() =>
              setAmountIn(direction === "eth-to-token" ? (ethBalance ?? "0") : (tokenBalance ?? "0"))
            }
          >
            MAX
          </button>
        </div>
        <div className="swap-balance">
          Balance:{" "}
          <span className="mono">
            {direction === "eth-to-token"
              ? `${ethBalNum.toFixed(4)} ${CHAIN.nativeGas}`
              : `${tokenBalNum.toFixed(4)} ${tokenSymbol}`}
          </span>
        </div>
      </div>

      {/* Output */}
      <div className="swap-input-group">
        <label className="swap-label">
          {direction === "eth-to-token" ? `Receive (${tokenSymbol})` : `Receive (${CHAIN.nativeGas})`}
        </label>
        <div className="swap-input-wrap swap-output">
          <span className="swap-output-value mono">
            {quoteLoading ? "..." : estimatedOut ? Number(estimatedOut).toFixed(6) : "0.0"}
          </span>
        </div>
        {estimatedUsd != null && (
          <div className="swap-balance">≈ {formatUsd(estimatedUsd)}</div>
        )}
      </div>

      {/* Slippage */}
      <div className="swap-slippage">
        <span className="swap-label">Slippage:</span>
        {[1, 3, 5, 10].map((s) => (
          <button
            key={s}
            type="button"
            className={`swap-slippage-btn ${slippage === s ? "active" : ""}`}
            onClick={() => setSlippage(s)}
          >
            {s}%
          </button>
        ))}
      </div>

      {/* Action */}
      <button
        type="button"
        className={`swap-primary ${insufficientBalance ? "swap-error" : ""}`}
        onClick={handleSwap}
        disabled={
          isPending ||
          isConfirming ||
          !amountIn ||
          Number(amountIn) <= 0 ||
          insufficientBalance ||
          quoteLoading
        }
      >
        {isPending
          ? "Confirm in wallet..."
          : isConfirming
            ? "Swapping..."
            : isSuccess
              ? "Swap successful!"
              : insufficientBalance
                ? `Insufficient ${direction === "eth-to-token" ? CHAIN.nativeGas : tokenSymbol}`
                : `Swap ${CHAIN.nativeGas} → ${tokenSymbol}`}
      </button>

      {/* Status */}
      {txHash && (
        <div className="swap-status">
          <a
            href={`${CHAIN.explorer}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="swap-tx-link"
          >
            View transaction ↗
          </a>
        </div>
      )}

      {txError && <div className="swap-error-msg">{txError}</div>}

      {isSuccess && (
        <div className="swap-success-msg">
          Swap completed! Your balances have been updated.
        </div>
      )}

      {/* Wallet info */}
      <div className="swap-wallet-info">
        <span className="mono" style={{ fontSize: 11, color: "var(--text-mute)" }}>
          {wallet ? shortenAddress(wallet, 6) : "—"} · {CHAIN.name}
        </span>
      </div>
    </div>
  );
}
