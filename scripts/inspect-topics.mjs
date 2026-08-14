/**
 * Inspect the actual event topics emitted by each factory in the last
 * 500k blocks, so we can match the correct event signature per platform.
 */
import { createPublicClient, http } from "viem";

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const client = createPublicClient({
  chain: { id: 4663, name: "RH", rpcUrls: { default: { http: [RPC] } } },
  transport: http(RPC),
});

const PLATFORMS = [
  { id: "ponsv2", factory: "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e" },
  { id: "trench", factory: "0x77dC6f6361b7b99456FC3761ce5b7ddA80d83f9d" },
  { id: "flap", factory: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09" },
  { id: "bags", factory: "0xe8Cc4431adF8b5A847C113EF0c6af9043219Cb37" },
  { id: "poolsfun", factory: "0x626C3d09B65bF5d1D40E0D5F25e19fa49783B3D4" },
  { id: "letscash", factory: "0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661" },
  { id: "long", factory: "0x22e99278308B393ea1260859B181AD7E78f5eeED" },
  { id: "varo", factory: "0x851153fe84239C2dC55fa191aC2f099e20a6d0b8" },
  { id: "virtuals", factory: "0xd4cCBFA37e2f35611b3042e4096Ad7a3459Bd007" },
  { id: "sushilaunchpad", factory: "0x104f1ab42674565ec3df0bfebccc4186f72fa7ed" },
];

const head = Number(await client.getBlockNumber());

for (const p of PLATFORMS) {
  try {
    const logs = await client.getLogs({
      address: p.factory,
      fromBlock: BigInt(head - 200000),
      toBlock: BigInt(head),
    });
    // Group by topic0
    const byTopic = new Map();
    for (const l of logs) {
      const t0 = l.topics?.[0] ?? "none";
      byTopic.set(t0, (byTopic.get(t0) || 0) + 1);
    }
    const top = [...byTopic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    console.log(`\n=== ${p.id} ===`);
    console.log(`  total logs (200k): ${logs.length}`);
    for (const [topic, count] of top) {
      console.log(`  ${count}x  ${topic}`);
    }
    if (logs.length) {
      const sample = logs[logs.length - 1];
      console.log(`  sample topics: ${JSON.stringify(sample.topics?.slice(0, 3))}`);
      console.log(`  sample data: ${String(sample.data).slice(0, 80)}`);
    }
  } catch (e) {
    console.log(`\n=== ${p.id} === ERROR: ${String(e).slice(0, 120)}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}
