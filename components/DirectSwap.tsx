"use client";

/**
 * Direct on-chain swap via Uniswap V2 Router contract.
 *
 * Features live real-time:
 *  - Auto-polling quotes every 15s when input is active
 *  - Auto-refresh ETH balance every 30s, token balance every 20s
 *  - Live indicator with "Updated Xs ago" timestamp
 *  - Animated quote refresh (pulse effect on new data)
 *  - Minimum received after slippage display
 *  - Price impact estimation
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useConnectedWallet } from "@/hooks/useConnectedWallet";
import { formatUnits, parseUnits, type Address } from "viem";
import { useSwap, useNativeBalance, useTokenBalance, useTokenInfo, type NativeBalanceState } from "@/hooks/useOnChain";
import { ROBINHOOD_ADDRESSES, WETH_BY_CHAIN } from "@/lib/contracts/addresses";
import { CHAIN } from "@/lib/constants";
import { formatUsd } from "@/lib/format";
import { shortenAddress } from "@/lib/wallet";

type SwapDirection = "eth-to-token" | "token-to-eth" | "token-to-token";

const QUOTE_POLL_MS = 15_000;
const ETH_BALANCE_POLL_MS = 30_000;
const TOKEN_BALANCE_POLL_MS = 20_000;

export function DirectSwap({
  tokenAddress,
  tokenSymbol,
  tokenPriceUsd,
}: {
  tokenAddress: string;
  tokenSymbol?: string;
  tokenPriceUsd?: number | null;
}) {
  const { address: wallet, isConnected } = useConnectedWallet();

  // Auto-polling ETH balance every 30s
  const { balance: ethBalance, loading: ethLoading, error: ethError, state: ethState, refetch: refetchEth, lastUpdated: ethLastUpdated } = useNativeBalance(
    wallet ?? null,
    ETH_BALANCE_POLL_MS
  );

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
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLastUpdated, setQuoteLastUpdated] = useState<number | null>(null);
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  const weth = WETH_BY_CHAIN[CHAIN.chainId] ?? ROBINHOOD_ADDRESSES.WETH;

  // Refs to track latest values for polling callbacks
  const directionRef = useRef(direction);
  const amountInRef = useRef(amountIn);
  const tokenAddressRef = useRef(tokenAddress);
  const tokenInfoRef = useRef(tokenInfo);
  const wethRef = useRef(weth);
  const isTxInProgress = isPending || isConfirming;
  const txInProgressRef = useRef(isTxInProgress);

  useEffect(() => { directionRef.current = direction; }, [direction]);
  useEffect(() => { amountInRef.current = amountIn; }, [amountIn]);
  useEffect(() => { tokenAddressRef.current = tokenAddress; }, [tokenAddress]);
  useEffect(() => { tokenInfoRef.current = tokenInfo; }, [tokenInfo]);
  useEffect(() => { wethRef.current = weth; }, [weth]);
  useEffect(() => { txInProgressRef.current = isTxInProgress; }, [isTxInProgress]);

  // Auto-select direction based on token
  useEffect(() => {
    if (tokenAddress.toLowerCase() === weth.toLowerCase()) {
      setDirection("token-to-eth");
    } else {
      setDirection("eth-to-token");
    }
  }, [tokenAddress, weth]);

  // ── Fetch Quote (used by both user input and poll) ──────────
  const fetchQuote = useCallback(async (isPoll: boolean = false) => {
    const d = directionRef.current;
    const amt = amountInRef.current;
    const ta = tokenAddressRef.current;
    const ti = tokenInfoRef.current;
    const w = wethRef.current;

    if (!amt || Number(amt) <= 0) {
      setEstimatedOut(null);
      setQuoteError(null);
      setQuoteLastUpdated(null);
      return;
    }
    if (txInProgressRef.current) return;

    if (isPoll) {
      setQuoteRefreshing(true);
    } else {
      setQuoteLoading(true);
    }
    setQuoteError(null);

    try {
      const decimalsIn = d === "eth-to-token" ? 18 : (ti?.decimals ?? 18);
      const amountInWei = parseUnits(amt, decimalsIn);

      let path: string[];
      if (d === "eth-to-token") {
        path = [w.toLowerCase(), ta.toLowerCase()];
      } else {
        path = [ta.toLowerCase(), w.toLowerCase()];
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

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `Quote failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      const out = formatUnits(BigInt(data.amountOut), 18);
      setEstimatedOut(out);
      setQuoteLastUpdated(Date.now());
      // Trigger pulse animation on new quote data
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setQuoteError(msg);
      setEstimatedOut(null);
    } finally {
      setQuoteLoading(false);
      setQuoteRefreshing(false);
    }
  }, []);

  // Fetch quote on user input change (debounced 500ms)
  useEffect(() => {
    const timer = setTimeout(() => fetchQuote(false), 500);
    return () => clearTimeout(timer);
  }, [fetchQuote, amountIn, direction, tokenAddress, tokenInfo, weth]);

  // ── Auto-polling quote every 15s ────────────────────────────
  useEffect(() => {
    if (!amountIn || Number(amountIn) <= 0) return;
    const id = setInterval(() => fetchQuote(true), QUOTE_POLL_MS);
    return () => clearInterval(id);
  }, [fetchQuote, amountIn]);

  // ── Auto-polling token balance every 20s ────────────────────
  useEffect(() => {
    if (!wallet || !tokenAddress || direction === "eth-to-token") return;
    const id = setInterval(() => refetchToken(), TOKEN_BALANCE_POLL_MS);
    return () => clearInterval(id);
  }, [wallet, tokenAddress, direction, refetchToken]);

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
  }, [
    amountIn, direction, weth, tokenAddress, tokenInfo?.decimals, slippage,
    swapEthForTokens, swapTokensForEth, swapTokensForTokens,
  ]);

  // Reset on success
  useEffect(() => {
    if (isSuccess) {
      setAmountIn("");
      setEstimatedOut(null);
      setQuoteLastUpdated(null);
      refetchEth();
      refetchToken();
    }
  }, [isSuccess, refetchEth, refetchToken]);

  // ── Computed values ─────────────────────────────────────────
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

  // Minimum received after slippage
  const minimumReceived = estimatedOut
    ? parseFloat(estimatedOut) * (1 - slippage / 100)
    : null;

  // Price impact: (inputValue - outputValueInUsd) / inputValue * 100
  // Estimated as: 1 - (output / input * priceRatio)
  const priceImpact = useMemo(() => {
    if (!estimatedOut || !amountNum || amountNum <= 0) return null;
    if (!tokenPriceUsd || tokenPriceUsd <= 0) return null;
    const outValueUsd = parseFloat(estimatedOut) * tokenPriceUsd;
    if (direction === "eth-to-token") {
      // input = ETH, output = token
      return ((1 - outValueUsd / amountNum) * 100);
    } else {
      // input = token, output = ETH
      // need ETH price: 1 / tokenPriceUsd * tokenPriceUsd = ... we need ETH price
      // Simplified: just show 1 - (output / input * priceRatio)
      return null; // Skip for now, needs ETH price
    }
  }, [estimatedOut, amountNum, tokenPriceUsd, direction]);

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

  const secondsSinceUpdate = quoteLastUpdated
    ? Math.floor((Date.now() - quoteLastUpdated) / 1000)
    : null;

  return (
    <div className="direct-swap">
      {/* ── Header with live indicator ── */}
      <div className="swap-header">
        <span className="dsection-title">
          Swap
          {quoteLastUpdated && (
            <span className={`swap-live-badge ${quoteRefreshing ? "refreshing" : ""}`}>
              <span className="swap-live-dot" />
              {" LIVE"}
            </span>
          )}
        </span>
        <div className="swap-header-actions">
          <button
            type="button"
            className="swap-refresh-btn"
            onClick={() => fetchQuote(true)}
            title="Refresh quote"
          >
            ↻
          </button>
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

      {/* ── Input ── */}
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
            {direction === "eth-to-token" ? (
              <EthBalanceLabel
                ethState={ethState}
                ethBalance={ethBalance}
                loading={ethLoading}
                error={ethError}
                symbol={CHAIN.nativeGas}
              />
            ) : (
              `${tokenBalNum.toFixed(4)} ${tokenSymbol}`
            )}
          </span>
          {direction === "eth-to-token" && ethError && (
            <button
              type="button"
              className="swap-retry-btn"
              onClick={refetchEth}
              title="Retry balance fetch"
            >
              ↻
            </button>
          )}
        </div>
      </div>

      {/* ── Output ── */}
      <div className="swap-input-group">
        <label className="swap-label">
          {direction === "eth-to-token" ? `Receive (${tokenSymbol})` : `Receive (${CHAIN.nativeGas})`}
        </label>
        <div className="swap-input-wrap swap-output">
          <span className={`swap-output-value mono ${pulse ? "quote-pulse" : ""}`}>
            {quoteLoading && !quoteRefreshing
              ? "..."
              : estimatedOut && Number(estimatedOut) > 0
                ? Number(estimatedOut).toFixed(6)
                : quoteError
                  ? "—"
                  : "0.0"}
          </span>
          {quoteRefreshing && (
            <span className="swap-refreshing-indicator" title="Refreshing quote..." />
          )}
        </div>
        {quoteError && (
          <div className="swap-quote-error" title={quoteError}>
            {quoteError.includes("liquidity") || quoteError.includes("K")
              ? "No liquidity for this pair on Uniswap V2"
              : quoteError}
          </div>
        )}
        <div className="swap-output-meta">
          {estimatedUsd != null && (
            <span className="swap-balance">≈ {formatUsd(estimatedUsd)}</span>
          )}
          {minimumReceived != null && minimumReceived > 0 && (
            <span className="swap-balance">
              Min received: {minimumReceived.toFixed(4)} {direction === "eth-to-token" ? tokenSymbol : CHAIN.nativeGas}
            </span>
          )}
        </div>
        {priceImpact != null && (
          <div className={`swap-price-impact ${priceImpact > 5 ? "high" : priceImpact > 2 ? "medium" : "low"}`}>
            Price impact: ~{priceImpact.toFixed(2)}%
          </div>
        )}
      </div>

      {/* ── Live status ── */}
      {quoteLastUpdated && (
        <div className="swap-live-status">
          <span className={`swap-live-dot ${quoteRefreshing ? "blink" : ""}`} />
          <span className="swap-live-text">
            {quoteRefreshing
              ? "Refreshing..."
              : secondsSinceUpdate !== null && secondsSinceUpdate < 60
                ? `Updated ${secondsSinceUpdate}s ago`
                : `Updated ${formatTimeAgo(quoteLastUpdated)}`}
          </span>
        </div>
      )}

      {/* ── Slippage ── */}
      <div className="swap-slippage">
        <span className="swap-label">Slippage:</span>
        {[0.5, 1, 3, 5, 10].map((s) => (
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

      {/* ── Action ── */}
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
          quoteLoading ||
          isSuccess
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

      {/* ── Status ── */}
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
          Swap completed! Balances updated.
        </div>
      )}

      {/* ── Wallet info ── */}
      <div className="swap-wallet-info">
        <span className="mono" style={{ fontSize: 11, color: "var(--text-mute)" }}>
          {wallet ? shortenAddress(wallet, 6) : "—"} · {CHAIN.name}
        </span>
      </div>
    </div>
  );
}

/**
 * Render native ETH balance with loading/error states.
 */
function EthBalanceLabel({
  ethState,
  ethBalance,
  loading,
  error,
  symbol,
}: {
  ethState: NativeBalanceState;
  ethBalance: string | null;
  loading: boolean;
  error: string | null;
  symbol: string;
}) {
  if (ethState.status === "idle") {
    return <span className="muted">— {symbol}</span>;
  }
  if (loading || ethState.status === "loading") {
    return <span className="muted">loading… {symbol}</span>;
  }
  if (error || ethState.status === "error") {
    return (
      <span className="swap-balance-error" title={error ?? undefined}>
        RPC error
      </span>
    );
  }
  const num = Number(ethBalance ?? 0);
  return `${num.toFixed(4)} ${symbol}`;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
