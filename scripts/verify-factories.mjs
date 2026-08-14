/**
 * Verify all launchpad factory contracts on Robinhood Chain:
 * - eth_getCode: does the contract exist?
 * - recent logs: is it active in the last ~1M blocks?
 * Prints a report so we know which platforms to implement/keep.
 */
import { createPublicClient, http } from "viem";

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const client = createPublicClient({
  chain: { id: 4663, name: "RH", rpcUrls: { default: { http: [RPC] } } },
  transport: http(RPC),
});

const PLATFORMS = [
  { id: "pons", factory: "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB" },
  { id: "ponsv2", factory: "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e" },
  { id: "flap", factory: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09" },
  { id: "trench", factory: "0x77dC6f6361b7b99456FC3761ce5b7ddA80d83f9d" },
  { id: "bow", factory: "0x229Faa919ABf14279E2461Dba53F039c5B4C7E29" },
  { id: "bags", factory: "0xe8Cc4431adF8b5A847C113EF0c6af9043219Cb37" },
  { id: "poolsfun", factory: "0x626C3d09B65bF5d1D40E0D5F25e19fa49783B3D4" },
  { id: "letscash", factory: "0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661" },
  { id: "long", factory: "0x22e99278308B393ea1260859B181AD7E78f5eeED" },
  { id: "varo", factory: "0x851153fe84239C2dC55fa191aC2f099e20a6d0b8" },
  { id: "virtuals", factory: "0xd4cCBFA37e2f35611b3042e4096Ad7a3459Bd007" },
  { id: "noxa", factory: "0xD9eC2db5f3D1b236843925949fe5bd8a3836FCcB" },
  // Extra: Noxa alt factory from docs, o1 factory, sushi launchpad
  { id: "o1factory", factory: "0x411F21283D3E492BC395027329e08f9F4F560Ba5" },
  { id: "sushilaunchpad", factory: "0x104f1ab42674565ec3df0bfebccc4186f72fa7ed" },
  { id: "lemonfactory", factory: "0x2ba793fd69bf251fd1af90b576be8b9fa6be46db" },
];

const head = Number(await client.getBlockNumber());
console.log("head:", head);

for (const p of PLATFORMS) {
  try {
    const code = await client.getCode({ address: p.factory });
    const hasCode = code && code !== "0x" && code.length > 2;
    let recentLogs = 0;
    let latestBlock = null;
    if (hasCode) {
      // Sample: count ANY logs in the last 500k blocks (topic-less)
      try {
        const logs = await client.getLogs({
          address: p.factory,
          fromBlock: BigInt(head - 500000),
          toBlock: BigInt(head),
        });
        recentLogs = logs.length;
        latestBlock = logs.length ? Number(logs[logs.length - 1].blockNumber) : null;
      } catch (e) {
        recentLogs = -1; // query failed
      }
    }
    console.log(
      `${p.id.padEnd(14)} ${p.factory}  code=${hasCode ? "YES" : "no "}  logs(500k)=${recentLogs}${latestBlock ? ` latest@${latestBlock}` : ""}`
    );
  } catch (e) {
    console.log(`${p.id.padEnd(14)} ${p.factory}  ERROR: ${String(e).slice(0, 80)}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}
