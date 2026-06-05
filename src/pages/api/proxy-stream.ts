import { NextApiRequest, NextApiResponse } from "next";
import https from "https";
import http from "http";

import { Client } from "pg";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.VERCEL) {
    try {
      const client = new Client({ connectionString: process.env.DATABASE_URL || "postgresql://neondb_owner:npg_afv7RLgh1oSF@ep-round-bird-amxcwfry.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require" });
      await client.connect();
      const dbRes = await client.query("SELECT value FROM system_config WHERE key='tunnel_url'");
      await client.end();
      if (dbRes.rows.length > 0 && dbRes.rows[0].value) {
        return res.redirect(302, `${dbRes.rows[0].value}${req.url}`);
      }
    } catch (e) {}
  }

  const { src } = req.query;

  if (!src || typeof src !== "string") {
    return res.status(400).send("Missing src");
  }

  const streamUrl = decodeURIComponent(src);

  const rangeHeader = req.headers.range;
  const headers: any = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,*/*;q=0.8",
  };
  if (rangeHeader) headers["Range"] = rangeHeader;

  const fetchWithRedirects = (url: string, redirectCount = 0) => {
    if (redirectCount > 5) {
      return res.status(502).send("Too many redirects");
    }

    const client = url.startsWith("https") ? https : http;
    const proxyReq = client.get(url, { headers }, (proxyRes) => {
      // Follow redirect if 3xx
      if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        let redirectUrl = proxyRes.headers.location;
        if (!redirectUrl.startsWith("http")) {
          redirectUrl = new URL(redirectUrl, url).toString();
        }
        return fetchWithRedirects(redirectUrl, redirectCount + 1);
      }

      // Set headers for final response
      res.status(proxyRes.statusCode || 200);
      const allowedHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'];
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (allowedHeaders.includes(key.toLowerCase()) && value) {
          res.setHeader(key, value as string);
        }
      }
      res.setHeader("Access-Control-Allow-Origin", "*");

      // Pipe the stream directly to the Next.js response
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("[ProxyStream] Error:", err.message);
      if (!res.headersSent) {
        res.status(500).send("Proxy error: " + err.message);
      } else {
        res.end();
      }
    });

    // If the client disconnects, abort the upstream request
    req.on("close", () => {
      proxyReq.destroy();
    });
  };

  fetchWithRedirects(streamUrl);
}
