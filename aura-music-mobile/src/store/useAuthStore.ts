import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const MASTER_ADMIN_EMAIL = "emil578jvcvn@gmail.com";
const AUTH_STORAGE_KEY = "aura_auth_user";
const PROMO_CODES_STORAGE_KEY = "@aura_generated_promo_codes";
const GRANTED_SUBS_STORAGE_KEY = "@aura_granted_subscriptions";

export type SubscriptionDuration = "1m" | "3m" | "6m" | "1y" | "lifetime";

export const DURATION_LABELS: Record<SubscriptionDuration, string> = {
  "1m": "شهر واحد",
  "3m": "3 شهور",
  "6m": "6 شهور",
  "1y": "سنة كاملة",
  "lifetime": "مدى الحياة",
};

export function getDurationMs(duration: SubscriptionDuration): number | null {
  switch (duration) {
    case "1m":
      return 30 * 24 * 60 * 60 * 1000;
    case "3m":
      return 90 * 24 * 60 * 60 * 1000;
    case "6m":
      return 180 * 24 * 60 * 60 * 1000;
    case "1y":
      return 365 * 24 * 60 * 60 * 1000;
    case "lifetime":
      return null;
  }
}

export interface GeneratedPromoCode {
  code: string;
  duration: SubscriptionDuration;
  durationLabel: string;
  createdAt: number;
  expiresAt: number | null;
  redeemed: boolean;
  redeemedBy?: string;
  redeemedAt?: number;
}

export interface GrantedSubscription {
  email: string;
  duration: SubscriptionDuration;
  durationLabel: string;
  grantedAt: number;
  expiresAt: number | null;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
  tier: "free" | "premium";
  createdAt?: number;
  premiumExpiresAt?: number | null;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isPremium: boolean;
  isLoading: boolean;
  isAuthModalVisible: boolean;
  isPremiumModalVisible: boolean;

  // Actions
  initAuth: () => Promise<void>;
  login: (email: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  register: (email: string, displayName: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  activateMasterAccount: () => Promise<void>;
  activatePromoCode: (code: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  setAuthModalVisible: (visible: boolean) => void;
  setPremiumModalVisible: (visible: boolean) => void;

  // Master Admin Capabilities
  generatePromoCode: (duration: SubscriptionDuration) => Promise<{ success: boolean; code: string; message: string }>;
  getGeneratedPromoCodes: () => Promise<GeneratedPromoCode[]>;
  grantSubscriptionToEmail: (targetEmail: string, duration: SubscriptionDuration) => Promise<{ success: boolean; message: string }>;
  getGrantedSubscriptions: () => Promise<GrantedSubscription[]>;
}

async function checkGrantedSubscription(email: string): Promise<GrantedSubscription | null> {
  try {
    const raw = await AsyncStorage.getItem(GRANTED_SUBS_STORAGE_KEY);
    if (!raw) return null;
    const map: Record<string, GrantedSubscription> = JSON.parse(raw);
    const sub = map[email.toLowerCase()];
    if (!sub) return null;
    if (sub.expiresAt && Date.now() > sub.expiresAt) return null;
    return sub;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isPremium: false,
  isLoading: true,
  isAuthModalVisible: false,
  isPremiumModalVisible: false,

  initAuth: async () => {
    try {
      const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        let user: AuthUser = JSON.parse(stored);
        const isMaster = user.email.toLowerCase() === MASTER_ADMIN_EMAIL;
        const granted = await checkGrantedSubscription(user.email);

        let isPrem = isMaster || user.tier === "premium" || Boolean(granted);
        if (user.premiumExpiresAt && Date.now() > user.premiumExpiresAt && !isMaster && !granted) {
          isPrem = false;
          user.tier = "free";
          await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        }

        set({
          user: isPrem && user.tier !== "premium" ? { ...user, tier: "premium" } : user,
          isAuthenticated: true,
          isPremium: isPrem,
          isLoading: false,
        });
        return;
      }
    } catch (e) {
      console.warn("[Auth] Failed to restore session:", e);
    }
    set({ isLoading: false });
  },

  login: async (email: string, _password?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return { success: false, message: "يرجى إدخال بريد إلكتروني صحيح" };
    }

    const isMaster = cleanEmail === MASTER_ADMIN_EMAIL;
    const granted = await checkGrantedSubscription(cleanEmail);
    const isPrem = isMaster || Boolean(granted);

    const user: AuthUser = {
      id: isMaster ? "master-admin-01" : `user-${Date.now()}`,
      email: cleanEmail,
      displayName: isMaster ? "Master Admin 👑" : cleanEmail.split("@")[0],
      role: isMaster ? "admin" : "user",
      tier: isPrem ? "premium" : "free",
      createdAt: Date.now(),
      premiumExpiresAt: granted?.expiresAt || null,
    };

    try {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      set({
        user,
        isAuthenticated: true,
        isPremium: isPrem,
        isAuthModalVisible: false,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "حدث خطأ أثناء تسجيل الدخول" };
    }
  },

  register: async (email: string, displayName: string, _password?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return { success: false, message: "يرجى إدخال بريد إلكتروني صحيح" };
    }
    if (!cleanName) {
      return { success: false, message: "يرجى إدخال الاسم المعروض" };
    }

    const isMaster = cleanEmail === MASTER_ADMIN_EMAIL;
    const granted = await checkGrantedSubscription(cleanEmail);
    const isPrem = isMaster || Boolean(granted);

    const user: AuthUser = {
      id: isMaster ? "master-admin-01" : `user-${Date.now()}`,
      email: cleanEmail,
      displayName: cleanName,
      role: isMaster ? "admin" : "user",
      tier: isPrem ? "premium" : "free",
      createdAt: Date.now(),
      premiumExpiresAt: granted?.expiresAt || null,
    };

    try {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      set({
        user,
        isAuthenticated: true,
        isPremium: isPrem,
        isAuthModalVisible: false,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "حدث خطأ أثناء التسجيل" };
    }
  },

  activateMasterAccount: async () => {
    const masterUser: AuthUser = {
      id: "master-admin-01",
      email: MASTER_ADMIN_EMAIL,
      displayName: "Master Admin 👑",
      role: "admin",
      tier: "premium",
      createdAt: Date.now(),
      premiumExpiresAt: null,
    };
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(masterUser));
    set({
      user: masterUser,
      isAuthenticated: true,
      isPremium: true,
      isAuthModalVisible: false,
      isPremiumModalVisible: false,
    });
  },

  activatePromoCode: async (code: string) => {
    const normalized = code.trim().toUpperCase();
    const hardcodedCodes = ["AURA-VIP", "AURA-2026", "PREMIUM", "VIP-GOLD", "AURA-PRO"];

    // Check hardcoded lifetime codes
    if (hardcodedCodes.includes(normalized) || normalized.startsWith("VIP-GOLD")) {
      const current = get().user;
      const updated: AuthUser = current
        ? { ...current, tier: "premium", premiumExpiresAt: null }
        : {
            id: `vip-user-${Date.now()}`,
            email: "vip@aura.music",
            displayName: "Aura VIP Member",
            role: "user",
            tier: "premium",
            createdAt: Date.now(),
            premiumExpiresAt: null,
          };

      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updated));
      set({ user: updated, isAuthenticated: true, isPremium: true });
      return { success: true, message: "🎉 تم تفعيل اشتراك AURA PREMIUM مدى الحياة بنجاح!" };
    }

    // Check generated promo codes from Master Admin
    try {
      const raw = await AsyncStorage.getItem(PROMO_CODES_STORAGE_KEY);
      if (raw) {
        const codesList: GeneratedPromoCode[] = JSON.parse(raw);
        const foundIndex = codesList.findIndex((c) => c.code.toUpperCase() === normalized);

        if (foundIndex !== -1) {
          const promo = codesList[foundIndex];
          if (promo.redeemed) {
            return { success: false, message: "هذا البرومو كود تم استخدامه مسبقاً." };
          }

          const current = get().user;
          const userEmail = current?.email || "user@aura.music";
          const durationMs = getDurationMs(promo.duration);
          const expiresAt = durationMs ? Date.now() + durationMs : null;

          // Mark promo code as redeemed
          promo.redeemed = true;
          promo.redeemedBy = userEmail;
          promo.redeemedAt = Date.now();
          codesList[foundIndex] = promo;
          await AsyncStorage.setItem(PROMO_CODES_STORAGE_KEY, JSON.stringify(codesList));

          // Upgrade user
          const updated: AuthUser = current
            ? { ...current, tier: "premium", premiumExpiresAt: expiresAt }
            : {
                id: `vip-user-${Date.now()}`,
                email: userEmail,
                displayName: "Aura VIP Member",
                role: "user",
                tier: "premium",
                createdAt: Date.now(),
                premiumExpiresAt: expiresAt,
              };

          await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updated));
          set({ user: updated, isAuthenticated: true, isPremium: true });

          return {
            success: true,
            message: `🎉 تم تفعيل اشتراك البريميوم بنجاح (${promo.durationLabel})! استمتع بصوت الاستوديو الخارق.`,
          };
        }
      }
    } catch (err) {
      console.warn("[activatePromoCode] Error checking generated codes:", err);
    }

    return { success: false, message: "كود التفعيل غير صالح. تأكد من إدخال الكود الصحيح." };
  },

  generatePromoCode: async (duration: SubscriptionDuration) => {
    const user = get().user;
    const isMaster = user?.email.toLowerCase() === MASTER_ADMIN_EMAIL || user?.role === "admin";
    if (!isMaster) {
      return { success: false, code: "", message: "هذه الصلاحية متاحة لحساب المدير الرئيسي فقط." };
    }

    const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const durationTag = duration.toUpperCase();
    const code = `AURA-${durationTag}-${randomSuffix}`;
    const durationLabel = DURATION_LABELS[duration];
    const durationMs = getDurationMs(duration);
    const expiresAt = durationMs ? Date.now() + durationMs : null;

    const newCode: GeneratedPromoCode = {
      code,
      duration,
      durationLabel,
      createdAt: Date.now(),
      expiresAt,
      redeemed: false,
    };

    try {
      const raw = await AsyncStorage.getItem(PROMO_CODES_STORAGE_KEY);
      const list: GeneratedPromoCode[] = raw ? JSON.parse(raw) : [];
      list.unshift(newCode);
      await AsyncStorage.setItem(PROMO_CODES_STORAGE_KEY, JSON.stringify(list));

      return {
        success: true,
        code,
        message: `تم توليد كود التفعيل: ${code} (${durationLabel})`,
      };
    } catch (err: any) {
      return { success: false, code: "", message: err.message || "فشل توليد الكود" };
    }
  },

  getGeneratedPromoCodes: async () => {
    try {
      const raw = await AsyncStorage.getItem(PROMO_CODES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  grantSubscriptionToEmail: async (targetEmail: string, duration: SubscriptionDuration) => {
    const user = get().user;
    const isMaster = user?.email.toLowerCase() === MASTER_ADMIN_EMAIL || user?.role === "admin";
    if (!isMaster) {
      return { success: false, message: "هذه الصلاحية متاحة لحساب المدير الرئيسي فقط." };
    }

    const clean = targetEmail.trim().toLowerCase();
    if (!clean || !clean.includes("@")) {
      return { success: false, message: "يرجى كتابة بريد إلكتروني صحيح." };
    }

    const durationLabel = DURATION_LABELS[duration];
    const durationMs = getDurationMs(duration);
    const expiresAt = durationMs ? Date.now() + durationMs : null;

    const subscription: GrantedSubscription = {
      email: clean,
      duration,
      durationLabel,
      grantedAt: Date.now(),
      expiresAt,
    };

    try {
      const raw = await AsyncStorage.getItem(GRANTED_SUBS_STORAGE_KEY);
      const map: Record<string, GrantedSubscription> = raw ? JSON.parse(raw) : {};
      map[clean] = subscription;
      await AsyncStorage.setItem(GRANTED_SUBS_STORAGE_KEY, JSON.stringify(map));

      // If granting to currently active user, upgrade immediately in memory!
      if (user && user.email.toLowerCase() === clean) {
        const updated: AuthUser = { ...user, tier: "premium", premiumExpiresAt: expiresAt };
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updated));
        set({ user: updated, isPremium: true });
      }

      return {
        success: true,
        message: `تم تفعيل اشتراك البريميوم بنجاح للحساب ${clean} (${durationLabel})!`,
      };
    } catch (err: any) {
      return { success: false, message: err.message || "فشل منح الاشتراك." };
    }
  },

  getGrantedSubscriptions: async () => {
    try {
      const raw = await AsyncStorage.getItem(GRANTED_SUBS_STORAGE_KEY);
      if (!raw) return [];
      const map: Record<string, GrantedSubscription> = JSON.parse(raw);
      return Object.values(map).sort((a, b) => b.grantedAt - a.grantedAt);
    } catch {
      return [];
    }
  },

  logout: async () => {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    set({
      user: null,
      isAuthenticated: false,
      isPremium: false,
    });
  },

  setAuthModalVisible: (visible: boolean) => set({ isAuthModalVisible: visible }),
  setPremiumModalVisible: (visible: boolean) => set({ isPremiumModalVisible: visible }),
}));
