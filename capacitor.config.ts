import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.aura.music",
  appName: "Aura Music",
  webDir: "out",
  bundledWebRuntime: false,
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
  },
  server: {
    androidScheme: "https",
    iosScheme: "https",
    url: "https://aura-musiic.vercel.app",
    allowNavigation: [
      "https://aura-musiic.vercel.app*",
      "*.vercel.app",
      "aura-musiic.vercel.app",
      "*.saavncdn.com",
      "*.albumaty.com",
      "*.sndcdn.com",
      "*.googlevideo.com",
      "*.youtube.com",
      "*.piped.video",
      "saavn.dev"
    ],
  },
  ios: {
    contentInset: "always",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
};

export default config;
