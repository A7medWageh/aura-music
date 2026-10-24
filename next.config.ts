import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheStartUrl: true,
  dynamicStartUrl: true,
  cacheOnFrontEndNav: true,
  fallbacks: {
    document: "/offline.html",
  },
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ request }: any) => request.mode === "navigate",
        handler: "NetworkFirst",
        options: {
          cacheName: "aura-pages-cache",
          networkTimeoutSeconds: 3,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
      {
        urlPattern: ({ url }: any) => url.pathname.startsWith("/_next/static/"),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "aura-static-chunks",
          expiration: {
            maxEntries: 120,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
      {
        urlPattern: ({ url }: any) => /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff|woff2)$/i.test(url.pathname),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "aura-static-assets",
          expiration: {
            maxEntries: 80,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
      {
        urlPattern: /^https:\/\/.*\.albumaty\.com\/.*/i,
        handler: "NetworkOnly",
      },
      {
        urlPattern: /\/api\/(ytdownload|audio|stream)/i,
        handler: "NetworkOnly",
      },
    ],
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
