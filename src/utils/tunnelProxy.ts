import { NextResponse } from "next/server";
import { Client } from "pg";

export async function checkTunnelRedirect(req: Request): Promise<NextResponse | null> {
  // Only redirect if running on Vercel
  if (!process.env.VERCEL) return null;

  try {
    const dbUrl = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_afv7RLgh1oSF@ep-round-bird-amxcwfry.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require";
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    const res = await client.query("SELECT value FROM system_config WHERE key='tunnel_url'");
    await client.end();

    if (res.rows.length > 0 && res.rows[0].value) {
      const tunnelUrl = res.rows[0].value;
      const url = new URL(req.url);
      
      // Rewrite the URL to point to the tunnel
      const targetUrl = `${tunnelUrl}${url.pathname}${url.search}`;
      
      // We use 302 redirect so the client directly hits the tunnel,
      // saving Vercel bandwidth and avoiding double-proxying.
      return NextResponse.redirect(targetUrl);
    }
  } catch (err) {
    console.error("[TunnelProxy] Error fetching tunnel_url:", err);
  }

  return null;
}
