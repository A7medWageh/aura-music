import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ReactNode } from "react";
import { AppShell } from "@/layouts/AppShell";
import { PwaRegistration } from "@/components/PwaRegistration";
import { OfflineSyncBridge } from "@/components/OfflineSyncBridge";

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

export default function RootLayout({ children }: { children: ReactNode }) {
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
