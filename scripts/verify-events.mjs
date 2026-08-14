/**
 * Verify event ABIs decode real logs (ABI definitions inlined).
 */
import { createPublicClient, http, parseAbiItem } from "viem";

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const client = createPublicClient({
  chain: { id: 4663, name: "RH", rpcUrls: { default: { http: [RPC] } } },
  transport: http(RPC),
});

const EVENTS = {
  ponsv2: parseAbiItem("event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)"),
  flap: parseAbiItem("event TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)"),
  trench: parseAbiItem("event TokenCreate(address indexed creator, address indexed curve, address indexed token, uint256 nonce, string name, string symbol, uint256 timestamp, string tokenURI)"),
  poolsfun: parseAbiItem("event TokenLaunched(address indexed token, address indexed pool, address pairedAsset, address indexed creator, address deployer, address feeRecipient, int24 startTick, string metadataUri, uint256 devBuyAmountOut)"),
  letscash: parseAbiItem("event TokenLaunched(address indexed token, address indexed creator, bytes32 indexed poolId, uint256 configId, uint256 firstBuyIn, uint256 firstBuyOut, address hook, address feeRecipient)"),
  long: parseAbiItem("event LaunchCreated(address indexed poolOrHook, address indexed asset, address indexed numeraire, address poolInitializer, address launcher, bytes32 tickerKey, uint48 deployedAt, uint48 reservedUntil, string normalizedTicker)"),
  virtuals: { type: "event", name: "Launched", inputs: [
    { type: "address", name: "token", indexed: true },
    { type: "address", name: "pair", indexed: true },
    { type: "uint256", name: "virtualId" },
    { type: "uint256", name: "initialPurchase" },
    { type: "uint256", name: "initialPurchasedAmount" },
    { type: "tuple", name: "launchParams", components: [
      { type: "uint8" }, { type: "uint16" }, { type: "bool" }, { type: "uint8" }, { type: "bool" },
    ] },
  ] },
  sushi: parseAbiItem("event TokenLaunched(address indexed creator, address indexed token, address indexed pool, address quoteToken, int24 startTick, string name, string symbol, uint16 reserveBps, uint256 reserveAmount, uint64 reserveUnlockAt, uint16 initialSushiFeeBps)"),
};

const FACTORIES = {
  ponsv2: "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e",
  flap: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09",
  trench: "0x77dC6f6361b7b99456FC3761ce5b7ddA80d83f9d",
  poolsfun: "0x626C3d09B65bF5d1D40E0D5F25e19fa49783B3D4",
  letscash: "0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661",
  long: "0x22e99278308B393ea1260859B181AD7E78f5eeED",
  virtuals: "0xd4cCBFA37e2f35611b3042e4096Ad7a3459Bd007",
  sushi: "0x104f1ab42674565ec3df0bfebccc4186f72fa7ed",
};

const head = Number(await client.getBlockNumber());

for (const [id, factory] of Object.entries(FACTORIES)) {
  try {
    const logs = await client.getLogs({
      address: factory,
      event: EVENTS[id],
      fromBlock: BigInt(head - 50000),
      toBlock: BigInt(head),
    });
    console.log(`${id.padEnd(10)} ${logs.length} decoded (50k blocks)`);
    if (logs.length) {
      console.log(`   ${JSON.stringify(logs[logs.length - 1].args).slice(0, 170)}`);
    }
  } catch (e) {
    console.log(`${id.padEnd(10)} ERROR: ${String(e).slice(0, 100)}`);
  }
  await new Promise((r) => setTimeout(r, 200));
}
