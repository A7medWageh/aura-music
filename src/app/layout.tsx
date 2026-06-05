import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ReactNode } from "react";
import { AppShell } from "@/layouts/AppShell";
import { PwaRegistration } from "@/components/PwaRegistration";
import { OfflineSyncBridge } from "@/components/OfflineSyncBridge";
import { redirect } from "next/navigation";
import { neon } from "@neondatabase/serverless";

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // iPhone notch support
};

export const metadata: Metadata = {
  title: "Aura Music | أورا موزيك",
  description: "أول منصة بث موسيقي عربية ذكية متكاملة",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Aura",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Gateway Redirect Logic: If hosted on Vercel, always redirect to the dynamic laptop URL
  if (process.env.VERCEL === "1" && process.env.NEON_DB_HOST) {
    try {
      const dbUrl = `postgresql://${process.env.NEON_DB_USERNAME}:${process.env.NEON_DB_PASSWORD}@${process.env.NEON_DB_HOST}/${process.env.NEON_DB_NAME}?sslmode=require`;
      const sql = neon(dbUrl);
      const rows = await sql`SELECT value FROM system_config WHERE key = 'tunnel_url'`;
      if (rows && rows.length > 0 && rows[0].value) {
        redirect(rows[0].value);
      }
    } catch (e) {
      console.error("Failed to fetch tunnel URL for gateway:", e);
    }
  }

  return (
    <html dir="rtl" lang="ar">
      <head>
        {/* Favicon and Apple PWA icons */}
        <link rel="icon" href="/logo-v2.png" />
        <link rel="apple-touch-icon" href="/logo-v2.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/logo-v2.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/logo-v2.png" />
        {/* Splash screens for iPhone */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Aura" />
      </head>
      <body suppressHydrationWarning>
        <PwaRegistration />
        <OfflineSyncBridge />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
