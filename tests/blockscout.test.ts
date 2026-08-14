/**
 * Unit tests for the Blockscout (Robinhood Explorer) transfer normalization.
 *
 * These tests pin down the buy/sell classification semantics and USD value
 * computation. Regression guards for:
 *  - Bug: buy/sell were inverted (token INTO pool was labeled "buy").
 *  - Bug: usdValue was 0 unless a token price was passed.
 *  - Bug: cache key ignored the price, so different prices shared payloads.
 *
 * Every test uses unique addresses because `cached()` has a 3s TTL and the
 * cache key is derived from token + pair + pages + price — reusing addresses
 * across tests would silently return another test's payload.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchBlockscoutTokenTransfers,
  type BlockscoutV1Transfer,
} from "@/lib/sources/blockscout";

const ZERO = "0x0000000000000000000000000000000000000000";

/** One whole token in 18-decimal base units. */
const ONE_TOKEN = "1000000000000000000";

let counter = 0;
/** Unique 40-hex-char address per call, so cache keys never collide. */
function uniqueAddr(): string {
  counter += 1;
  return `0x${counter.toString(16).padStart(40, "0")}`;
}

function rawTransfer(overrides: Partial<BlockscoutV1Transfer> = {}): BlockscoutV1Transfer {
  return {
    blockNumber: "12345",
    timeStamp: "1785116378",
    hash: `0x${(counter + 0xdeadbeef).toString(16).padStart(64, "0")}`,
    nonce: "1",
    blockHash: `0x${(counter + 0xcafe).toString(16).padStart(64, "0")}`,
    transactionIndex: "0",
    from: uniqueAddr(),
    to: uniqueAddr(),
    value: ONE_TOKEN,
    gas: "21000",
    gasPrice: "1000000000",
    gasUsed: "21000",
    cumulativeGasUsed: "21000",
    input: "0x",
    contractAddress: uniqueAddr(),
    tokenName: "Test Token",
    tokenSymbol: "TST",
    tokenDecimal: "18",
    ...overrides,
  };
}

function mockBlockscout(result: BlockscoutV1Transfer[] | string) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ status: "1", message: "OK", result }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchBlockscoutTokenTransfers — classification", () => {
  it("labels pool → user as BUY with the user as trader", async () => {
    const pool = uniqueAddr();
    const user = uniqueAddr();
    const token = uniqueAddr();
    mockBlockscout([rawTransfer({ from: pool, to: user })]);

    const txs = await fetchBlockscoutTokenTransfers(token, {
      pairAddress: pool,
      tokenPriceUsd: 2,
      pages: 2,
    });

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("buy");
    expect(txs[0].trader).toBe(user);
    expect(txs[0].from).toBe(pool);
    expect(txs[0].to).toBe(user);
  });

  it("labels user → pool as SELL with the user as trader", async () => {
    const pool = uniqueAddr();
    const user = uniqueAddr();
    const token = uniqueAddr();
    mockBlockscout([rawTransfer({ from: user, to: pool })]);

    const txs = await fetchBlockscoutTokenTransfers(token, {
      pairAddress: pool,
      tokenPriceUsd: 2,
      pages: 2,
    });

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("sell");
    expect(txs[0].trader).toBe(user);
    expect(txs[0].from).toBe(user);
    expect(txs[0].to).toBe(pool);
  });

  it("labels zero-address → wallet as MINT", async () => {
    const user = uniqueAddr();
    const token = uniqueAddr();
    mockBlockscout([rawTransfer({ from: ZERO, to: user })]);

    const txs = await fetchBlockscoutTokenTransfers(token, { pages: 2 });

    expect(txs[0].type).toBe("mint");
    expect(txs[0].trader).toBe(user);
  });

  it("labels wallet → zero-address as BURN", async () => {
    const user = uniqueAddr();
    const token = uniqueAddr();
    mockBlockscout([rawTransfer({ from: user, to: ZERO })]);

    const txs = await fetchBlockscoutTokenTransfers(token, { pages: 2 });

    expect(txs[0].type).toBe("burn");
    expect(txs[0].trader).toBe(user);
  });

  it("labels neither-side-pool as TRANSFER with sender as trader", async () => {
    const pool = uniqueAddr();
    const user = uniqueAddr();
    const other = uniqueAddr();
    const token = uniqueAddr();
    mockBlockscout([rawTransfer({ from: user, to: other })]);

    const txs = await fetchBlockscoutTokenTransfers(token, {
      pairAddress: pool,
      pages: 2,
    });

    expect(txs[0].type).toBe("transfer");
    expect(txs[0].trader).toBe(user);
  });
});

describe("fetchBlockscoutTokenTransfers — USD value", () => {
  it("computes usdValue = tokenAmount × price", async () => {
    const pool = uniqueAddr();
    const user = uniqueAddr();
    const token = uniqueAddr();
    mockBlockscout([rawTransfer({ from: pool, to: user })]);

    const txs = await fetchBlockscoutTokenTransfers(token, {
      pairAddress: pool,
      tokenPriceUsd: 2.5,
      pages: 2,
    });

    expect(txs[0].tokenAmount).toBe(1);
    expect(txs[0].usdValue).toBeCloseTo(2.5, 6);
    expect(txs[0].isWhale).toBe(false);
    expect(txs[0].isMegaWhale).toBe(false);
  });

  it("returns usdValue 0 when no price is passed", async () => {
    const pool = uniqueAddr();
    const user = uniqueAddr();
    const token = uniqueAddr();
    mockBlockscout([rawTransfer({ from: pool, to: user })]);

    const txs = await fetchBlockscoutTokenTransfers(token, {
      pairAddress: pool,
      pages: 2,
    });

    expect(txs[0].usdValue).toBe(0);
  });

  it("flags whale and mega-whale thresholds", async () => {
    // 10_000 tokens at $2 = $20k → whale, not mega.
    const pool = uniqueAddr();
    const user = uniqueAddr();
    const token = uniqueAddr();
    const bigValue = (10_000n * 10n ** 18n).toString();
    mockBlockscout([rawTransfer({ from: pool, to: user, value: bigValue })]);

    const txs = await fetchBlockscoutTokenTransfers(token, {
      pairAddress: pool,
      tokenPriceUsd: 2,
      pages: 2,
    });

    expect(txs[0].usdValue).toBeCloseTo(20_000, 6);
    expect(txs[0].isWhale).toBe(true);
    expect(txs[0].isMegaWhale).toBe(false);
  });

  it("does not share cached USD values across different prices", async () => {
    // Same token + pair, two different prices: the cache key must include
    // the price so the second call re-fetches instead of reusing $1 values.
    const pool = uniqueAddr();
    const user = uniqueAddr();
    const token = uniqueAddr();
    const fetchMock = mockBlockscout([rawTransfer({ from: pool, to: user })]);

    const cheap = await fetchBlockscoutTokenTransfers(token, {
      pairAddress: pool,
      tokenPriceUsd: 1,
      pages: 2,
    });
    const expensive = await fetchBlockscoutTokenTransfers(token, {
      pairAddress: pool,
      tokenPriceUsd: 100,
      pages: 2,
    });

    expect(cheap[0].usdValue).toBeCloseTo(1, 6);
    expect(expensive[0].usdValue).toBeCloseTo(100, 6);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
