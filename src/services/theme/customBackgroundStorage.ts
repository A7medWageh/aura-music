/**
 * Custom Background Storage Service (IndexedDB)
 * 
 * Stores high-resolution background images for "library" (offline library page)
 * and "global" (app-wide across all pages).
 * 
 * Ensures 100% offline persistence, instant loading, and zero memory exhaustion.
 */

export type BackgroundScope = "library" | "global";

export interface CustomBackgroundConfig {
  dataUrl: string;
  opacity: number;        // Overlay darkness (0.1 to 0.9, default 0.5)
  blur: number;           // Blur in px (0 to 30, default 0)
  hasDepth: boolean;      // Subtle 3D parallax depth effect
  updatedAt: number;
}

const DB_NAME = "aura-themes-db";
const DB_VERSION = 1;
const STORE_NAME = "custom_backgrounds";

function openThemeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not available"));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Notify all listeners (AppBackgroundLayer, modals, etc.) that background configuration changed.
 */
export function notifyBackgroundUpdated(scope?: BackgroundScope) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("aura-background-updated", { detail: { scope } }));
  } catch {}
}

/**
 * Open the Background Customization Modal from anywhere in the app.
 */
export function openBackgroundCustomizer(scope: BackgroundScope = "library") {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("open-background-modal", { detail: { scope } }));
  } catch {}
}

/**
 * Retrieve saved background configuration for a given scope.
 */
export async function getCustomBackground(scope: BackgroundScope): Promise<CustomBackgroundConfig | null> {
  try {
    const db = await openThemeDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(scope);
      req.onsuccess = () => {
        resolve(req.result || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Save background configuration for a given scope and notify listeners.
 */
export async function saveCustomBackground(
  scope: BackgroundScope,
  config: Omit<CustomBackgroundConfig, "updatedAt">
): Promise<void> {
  const db = await openThemeDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: CustomBackgroundConfig = {
      ...config,
      updatedAt: Date.now(),
    };
    const req = store.put(record, scope);
    req.onsuccess = () => {
      notifyBackgroundUpdated(scope);
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Remove custom background for a given scope.
 */
export async function removeCustomBackground(scope: BackgroundScope): Promise<void> {
  try {
    const db = await openThemeDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(scope);
      req.onsuccess = () => {
        notifyBackgroundUpdated(scope);
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

/**
 * Process uploaded image file:
 * - Resizes overly large dimensions (e.g. 48MP mobile photos) down to Retina 2K/4K (max 2560px)
 *   to ensure ultra-crisp quality without browser memory issues.
 * - Converts to a high-quality JPEG/WebP base64 Data URL.
 */
export function processImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("فشل قراءة ملف الصورة"));
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) return reject(new Error("ملف فارغ"));

      const img = new Image();
      img.onerror = () => reject(new Error("صيغة الصورة غير مدعومة"));
      img.onload = () => {
        const MAX_DIMENSION = 2560; // Ultra HD / 2K Retina
        let { width, height } = img;

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return resolve(result); // Fallback to raw base64
        }

        // High quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to high quality JPEG/WebP
        try {
          const optimized = canvas.toDataURL("image/webp", 0.92);
          resolve(optimized);
        } catch {
          try {
            const fallbackJpeg = canvas.toDataURL("image/jpeg", 0.92);
            resolve(fallbackJpeg);
          } catch {
            resolve(result);
          }
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}
