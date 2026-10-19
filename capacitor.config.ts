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
      "*.saavncdn.com",
      "*.albumaty.com",
      "*.sndcdn.com",
      "*.googlevideo.com",
      "*.youtube.com",
      "*.piped.video",
      "saavn.dev",
      "aura-musiic.vercel.app"
    ],
  },
  ios: {
    contentInset: "always",
    preferredContentMode: "mobile",
    scheme: "auramusic",
  },
};

export default config;
