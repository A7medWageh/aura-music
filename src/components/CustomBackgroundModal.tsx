"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Upload, 
  Trash2, 
  Check, 
  Image as ImageIcon, 
  Layers, 
  Sparkles, 
  Eye, 
  Sun, 
  Sliders, 
  Globe, 
  Library,
  Copy
} from "lucide-react";
import { 
  BackgroundScope, 
  CustomBackgroundConfig, 
  getCustomBackground, 
  saveCustomBackground, 
  removeCustomBackground, 
  processImageFile 
} from "@/services/theme/customBackgroundStorage";
import { useToastStore } from "@/state/toastStore";

export function CustomBackgroundModal() {
  const { addToast } = useToastStore();
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState<BackgroundScope>("library");
  const [loading, setLoading] = useState(false);

  // Current scope settings
  const [dataUrl, setDataUrl] = useState<string>("");
  const [opacity, setOpacity] = useState<number>(0.55);
  const [blur, setBlur] = useState<number>(0);
  const [hasDepth, setHasDepth] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Listen for open events from anywhere (Library button or FloatingActionMenu)
  useEffect(() => {
    const handleOpen = (e: any) => {
      const targetScope = e.detail?.scope || "library";
      setScope(targetScope);
      setIsOpen(true);
    };

    window.addEventListener("open-background-modal", handleOpen);
    return () => {
      window.removeEventListener("open-background-modal", handleOpen);
    };
  }, []);

  // Load config whenever scope changes or modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    (async () => {
      const config = await getCustomBackground(scope);
      if (!isMounted) return;
      if (config) {
        setDataUrl(config.dataUrl || "");
        setOpacity(typeof config.opacity === "number" ? config.opacity : 0.55);
        setBlur(typeof config.blur === "number" ? config.blur : 0);
        setHasDepth(config.hasDepth ?? true);
      } else {
        setDataUrl("");
        setOpacity(0.55);
        setBlur(0);
        setHasDepth(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, scope]);

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addToast("يرجى اختيار ملف صورة صالح");
      return;
    }

    setLoading(true);
    try {
      const processedUrl = await processImageFile(file);
      setDataUrl(processedUrl);
      addToast("تمت معالجة الصورة بأعلى دقة ✨");
    } catch (err: any) {
      addToast(err?.message || "تعذر معالجة الصورة");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Save current settings
  const handleSave = async () => {
    if (!dataUrl) {
      addToast("يرجى اختيار صورة أولاً");
      return;
    }

    setLoading(true);
    try {
      await saveCustomBackground(scope, {
        dataUrl,
        opacity,
        blur,
        hasDepth,
      });

      addToast(
        scope === "library"
          ? "تم تطبيق خلفية المكتبة بنجاح 🎧✨"
          : "تم تطبيق الخلفية العامة لكل الصفحات بنجاح 🌐✨"
      );
      setIsOpen(false);
    } catch {
      addToast("حدث خطأ أثناء حفظ الخلفية");
    } finally {
      setLoading(false);
    }
  };

  // Remove background
  const handleRemove = async () => {
    if (!confirm(scope === "library" ? "هل تريد إزالة خلفية المكتبة والرجوع للشكل الافتراضي؟" : "هل تريد إزالة الخلفية العامة لكل الصفحات؟")) {
      return;
    }

    setLoading(true);
    try {
      await removeCustomBackground(scope);
      setDataUrl("");
      addToast("تمت إزالة الخلفية والعودة للافتراضي 🧹");
      setIsOpen(false);
    } catch {
      addToast("تعذر إزالة الخلفية");
    } finally {
      setLoading(false);
    }
  };

  // Copy to the other scope
  const handleApplyToBoth = async () => {
    if (!dataUrl) return;
    const otherScope: BackgroundScope = scope === "library" ? "global" : "library";
    try {
      await saveCustomBackground(otherScope, {
        dataUrl,
        opacity,
        blur,
        hasDepth,
      });
      addToast(
        otherScope === "global"
          ? "تم تطبيق نفس الخلفية على كل صفحات التطبيق أيضاً! 🌐"
          : "تم تطبيق نفس الخلفية على صفحة المكتبة أيضاً! 🎧"
      );
    } catch {
      addToast("تعذر نسخ الخلفية");
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 select-none">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsOpen(false)}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          className="relative w-full max-w-lg rounded-3xl bg-slate-950/90 border border-white/15 shadow-2xl p-5 sm:p-6 text-white overflow-hidden max-h-[92vh] flex flex-col"
          style={{
            boxShadow: "0 24px 64px rgba(0,0,0,0.85), 0 0 40px rgba(99,102,241,0.22)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-wide">تخصيص صورة الخلفية</h3>
                <p className="text-xs text-gray-400">اختر صورتك المفضلة وتحكّم في التباين والعمق</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scope Selector Tabs */}
          <div className="flex p-1 bg-white/5 rounded-2xl my-4 border border-white/10 shrink-0">
            <button
              onClick={() => setScope("library")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                scope === "library"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Library className="w-4 h-4" />
              <span>خلفية المكتبة (الأوفلاين)</span>
            </button>
            <button
              onClick={() => setScope("global")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                scope === "global"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>خلفية كل الصفحات (عامة)</span>
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            {/* Image Preview & Upload Box */}
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {dataUrl ? (
                <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden border border-white/20 group">
                  {/* Preview Image with current Blur */}
                  <img
                    src={dataUrl}
                    alt="معاينة الخلفية"
                    className="w-full h-full object-cover transition-all duration-300"
                    style={{
                      filter: blur > 0 ? `blur(${blur * 0.4}px)` : undefined,
                      transform: hasDepth ? "scale(1.04)" : undefined,
                    }}
                  />
                  {/* Preview Scrim with current Opacity */}
                  <div
                    className="absolute inset-0 transition-colors duration-200"
                    style={{
                      background: `rgba(0,0,0,${opacity})`,
                    }}
                  />

                  {/* Sample Mock Elements to show readability */}
                  <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md">
                        معاينة تناسق العناصر
                      </span>
                      <span className="text-xs font-bold text-indigo-300 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> جودة فائقة
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/40 flex items-center justify-center text-xs font-black">
                        🎧
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black truncate">اسم الأغنية أو الألبوم</p>
                        <p className="text-[10px] text-gray-300">وضوح عالي جداً مع خلفيتك</p>
                      </div>
                    </div>
                  </div>

                  {/* Change Image Button Overlay */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-xs font-black text-white backdrop-blur-sm"
                  >
                    <Upload className="w-4 h-4" />
                    <span>تغيير الصورة</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-[16/9] rounded-2xl border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 flex flex-col items-center justify-center gap-3 transition-all group cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 group-hover:bg-indigo-500/30 text-indigo-400 flex items-center justify-center transition-colors">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black text-white group-hover:text-indigo-300 transition-colors">
                      اضغط لاختيار صورة من جهازك
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      يدعم الصور عالية الدقة (JPG, PNG, WebP)
                    </p>
                  </div>
                </button>
              )}
            </div>

            {/* Adjustments (Only shown if image is selected) */}
            {dataUrl && (
              <div className="space-y-4 pt-2">
                {/* Opacity / Dimming Slider */}
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-1.5 text-gray-300">
                      <Sun className="w-4 h-4 text-amber-400" /> تعتيم الخلفية (وضوح النصوص)
                    </span>
                    <span className="text-indigo-400 font-mono">{Math.round(opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="0.85"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>صورة أفتح</span>
                    <span>متوازن (موصى به)</span>
                    <span>تعتيم أعلى</span>
                  </div>
                </div>

                {/* Blur Slider */}
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-1.5 text-gray-300">
                      <Sliders className="w-4 h-4 text-cyan-400" /> تمويه الخلفية (Soft Blur)
                    </span>
                    <span className="text-cyan-400 font-mono">{blur}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={blur}
                    onChange={(e) => setBlur(parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>حادة 100%</span>
                    <span>تمويه ناعم</span>
                    <span>تمويه فني</span>
                  </div>
                </div>

                {/* Depth / Parallax Toggle */}
                <div 
                  onClick={() => setHasDepth(!hasDepth)}
                  className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white">تأثير العمق ثلاثي الأبعاد (Parallax)</h4>
                      <p className="text-[10px] text-gray-400">حركة سينمائية خفيفة مع السكرول تعطي إحساساً رائعاً بالعمق</p>
                    </div>
                  </div>
                  <div
                    className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-1 ${
                      hasDepth ? "bg-indigo-600" : "bg-white/20"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                        hasDepth ? "translate-x-0" : "-translate-x-5"
                      }`}
                    />
                  </div>
                </div>

                {/* Copy to other scope button */}
                <button
                  type="button"
                  onClick={handleApplyToBoth}
                  className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-300 hover:text-white flex items-center justify-center gap-2 transition-all"
                >
                  <Copy className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {scope === "library"
                      ? "تطبيق نفس هذه الصورة على كل صفحات التطبيق أيضاً"
                      : "تطبيق نفس هذه الصورة على صفحة المكتبة أيضاً"}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-white/10 flex items-center gap-2 shrink-0 mt-2">
            {dataUrl && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={loading}
                className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                title="إزالة الخلفية والعودة للافتراضي"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-300 transition-colors"
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={loading || !dataUrl}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg transition-all ${
                !dataUrl
                  ? "bg-gray-700 text-gray-400 cursor-not-allowed opacity-50"
                  : "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-indigo-500/25 active:scale-95"
              }`}
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{loading ? "جارٍ الحفظ..." : "حفظ وتطبيق"}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
