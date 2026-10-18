import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheStartUrl: false,
  dynamicStartUrl: false,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.albumaty\.com\/.*/i,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/api\/(ytdownload|audio|stream)/i,
        handler: 'NetworkOnly',
      }
    ]
  },
  customWorkerSrc: "worker",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // output: "standalone",
  experimental: {
    optimizePackageImports: ["framer-motion"],
  },
  // Packages that should NOT be bundled by webpack (use native Node.js require)
  serverExternalPackages: ["play-dl", "@distube/ytdl-core", "youtubei.js", "ioredis", "pg", "yt-search", "cheerio"],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      }
    ];
  }
};

export default withPWA(nextConfig);
