/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Skip Google Fonts download at build time (use fallback / self-host instead)
  optimizeFonts: false,
  distDir: ".next",
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "cdn.dexscreener.com" },
      { protocol: "https", hostname: "**.geckoterminal.com" },
      { protocol: "https", hostname: "assets.geckoterminal.com" },
      { protocol: "https", hostname: "coin-images.coingecko.com" },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // Optional peer deps dari wagmi/connectors & @privy-io/react-auth
    // yang di-import dinamis tapi tidak terinstall.
    // alias:false → webpack ganti dengan empty module (server + client).
    const optionalExternals = [
      "@farcaster/mini-app-solana",
      "@base-org/account",
      "@coinbase/wallet-sdk",
      "@metamask/connect-evm",
      "@multiformats/multiaddr",
      "@stripe/crypto",
      "accounts",
      "react-native",
      "react-native-mmkv",
    ];
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    for (const ext of optionalExternals) {
      config.resolve.alias[ext] = false;
    }
    return config;
  },
};

export default nextConfig;
