import { create } from "zustand";

export type ToastType = "normal" | "hq" | "error" | "success";

export interface Toast {
  id: string;
  msg: string;
  type: ToastType;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (msg: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (msg, type = "normal") => {
    const id = Math.random().toString(36).substring(7);
    set((state) => ({ toasts: [...state.toasts, { id, msg, type }] }));
    // Auto remove after 3.5 seconds
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
