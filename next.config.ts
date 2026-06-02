import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    optimizePackageImports: ["framer-motion"],
  },
  // Packages that should NOT be bundled by webpack (use native Node.js require)
  serverExternalPackages: ["play-dl", "@distube/ytdl-core", "youtubei.js", "ioredis"],
};

export default withPWA(nextConfig);
