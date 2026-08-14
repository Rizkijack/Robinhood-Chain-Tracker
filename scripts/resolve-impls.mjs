/**
 * Resolve proxy implementation addresses (EIP-1967 slot) and print the
 * launch-relevant events from the implementation ABI via Blockscout.
 */
import { createPublicClient, http } from "viem";

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const client = createPublicClient({
  chain: { id: 4663, name: "RH", rpcUrls: { default: { http: [RPC] } } },
  transport: http(RPC),
});

// EIP-1967 implementation slot
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const PROXIES = [
  { id: "trench", proxy: "0x77dC6f6361b7b99456FC3761ce5b7ddA80d83f9d" },
  { id: "flap", proxy: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09" },
  { id: "bags", proxy: "0xe8Cc4431adF8b5A847C113EF0c6af9043219Cb37" },
  { id: "letscash", proxy: "0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661" },
  { id: "varo", proxy: "0x851153fe84239C2dC55fa191aC2f099e20a6d0b8" },
  { id: "virtuals", proxy: "0xd4cCBFA37e2f35611b3042e4096Ad7a3459Bd007" },
  { id: "o1factory", proxy: "0x411F21283D3E492BC395027329e08f9F4F560Ba5" },
];

for (const p of PROXIES) {
  try {
    const slot = await client.getStorageAt({
      address: p.proxy,
      slot: IMPL_SLOT,
    });
    const impl = slot && slot !== "0x" + "0".repeat(64)
      ? `0x${slot.slice(26)}`.toLowerCase()
      : null;
    console.log(`${p.id.padEnd(10)} ${p.proxy} → impl: ${impl ?? "none"}`);
  } catch (e) {
    console.log(`${p.id.padEnd(10)} ERROR: ${String(e).slice(0, 80)}`);
  }
  await new Promise((r) => setTimeout(r, 200));
}
