import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["framer-motion"],
  },
  // Packages that should NOT be bundled by webpack (use native Node.js require)
  serverExternalPackages: ["play-dl", "youtubei.js", "ioredis"],
};

export default nextConfig;
