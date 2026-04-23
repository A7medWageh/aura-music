"use client";

import { useEffect } from "react";
import { flushOfflineSyncQueue } from "@/offline/sync";

export function OfflineSyncBridge() {
  useEffect(() => {
    const runSync = () => {
      void flushOfflineSyncQueue().catch(() => undefined);
    };

    window.addEventListener("online", runSync);
    runSync();

    return () => {
      window.removeEventListener("online", runSync);
    };
  }, []);

  return null;
}
