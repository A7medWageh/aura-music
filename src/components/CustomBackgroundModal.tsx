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
  Sun, 
  Sliders, 
  Globe, 
  Library,
  Copy,
  Crop,
  RotateCcw,
  ZoomIn,
  Move
} from "lucide-react";
import { 
  BackgroundScope, 
  BackgroundFitMode,
  getCustomBackground, 
  saveCustomBackground, 
  removeCustomBackground, 
  processImageFile 
} from "@/services/theme/customBackgroundStorage";
import { useToastStore } from "@/state/toastStore";

type AspectRatioPreset = "mobile" | "9:16" | "3:4" | "16:9" | "1:1";

export function CustomBackgroundModal() {
  const { addToast } = useToastStore();
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState<BackgroundScope>("library");
  const [loading, setLoading] = useState(false);

  // Current scope settings
  const [dataUrl, setDataUrl] = useState<string>("");
  const [rawUploadedUrl, setRawUploadedUrl] = useState<string>("");
  const [opacity, setOpacity] = useState<number>(0.55);
  const [blur, setBlur] = useState<number>(0);
  const [hasDepth, setHasDepth] = useState<boolean>(true);
  const [fitMode, setFitMode] = useState<BackgroundFitMode>("auto-fit");

  // Crop Mode state
  const [isCropping, setIsCropping] = useState<boolean>(false);
  const [cropAspectRatio, setCropAspectRatio] = useState<AspectRatioPreset>("mobile");
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);

  // Measure natural dimensions of uploaded image
  useEffect(() => {
    if (!rawUploadedUrl) return;
    const img = new Image();
    img.onload = () => {
      setNaturalDimensions({
        width: img.naturalWidth || 800,
        height: img.naturalHeight || 600,
      });
    };
    img.src = rawUploadedUrl;
  }, [rawUploadedUrl]);

  // Listen for open events from anywhere (Library button or FloatingActionMenu)
  useEffect(() => {
    const handleOpen = (e: any) => {
      const targetScope = e.detail?.scope || "library";
      setScope(targetScope);
      setIsCropping(false);
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
        setRawUploadedUrl(config.dataUrl || "");
        setOpacity(typeof config.opacity === "number" ? config.opacity : 0.55);
        setBlur(typeof config.blur === "number" ? config.blur : 0);
        setHasDepth(config.hasDepth ?? true);
        setFitMode(config.fitMode || "auto-fit");
      } else {
        setDataUrl("");
        setRawUploadedUrl("");
        setOpacity(0.55);
        setBlur(0);
        setHasDepth(true);
        setFitMode("auto-fit");
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, scope]);

  // Handle file selection -> opens directly in interactive Crop Mode
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
      setRawUploadedUrl(processedUrl);
      // Reset crop params
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsCropping(true);
      addToast("حدد واقتص الجزء الذي تريده من صورتك بدقة ✂️");
    } catch (err: any) {
      addToast(err?.message || "تعذر قراءة ملف الصورة");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const getCropFrameNumbers = (): { width: number; height: number } => {
    if (cropAspectRatio === "mobile") {
      if (typeof window !== "undefined") {
        const vw = window.innerWidth;
        const vh = Math.max(300, window.innerHeight - 206);
        const ratio = vw / vh;
        const h = 295;
        const w = Math.round(h * ratio);
        return {
          width: Math.max(130, Math.min(260, w)),
          height: h,
        };
      }
      return { width: 165, height: 295 };
    }
    if (cropAspectRatio === "9:16") return { width: 170, height: 302 };
    if (cropAspectRatio === "3:4") return { width: 210, height: 280 };
    if (cropAspectRatio === "16:9") return { width: 300, height: 169 };
    return { width: 240, height: 240 };
  };

  // Drag / Pan handlers for Cropping
  const handlePointerDown = (clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Perform High-Resolution Crop based on user's visual frame with ZERO distortion
  const applyCrop = () => {
    if (!rawUploadedUrl) {
      setIsCropping(false);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const srcW = img.naturalWidth || 1;
      const srcH = img.naturalHeight || 1;
      const frame = getCropFrameNumbers();

      const bScale = Math.max(frame.width / srcW, frame.height / srcH);
      const cScale = bScale * zoom;
      const dispW = Math.round(srcW * cScale);
      const dispH = Math.round(srcH * cScale);

      const mPanX = Math.max(0, (dispW - frame.width) / 2);
      const mPanY = Math.max(0, (dispH - frame.height) / 2);
      const cPanX = Math.max(-mPanX, Math.min(mPanX, pan.x));
      const cPanY = Math.max(-mPanY, Math.min(mPanY, pan.y));

      const iLeft = Math.round((frame.width - dispW) / 2 + cPanX);
      const iTop = Math.round((frame.height - dispH) / 2 + cPanY);

      // Map display frame [0, 0, frame.width, frame.height] to source image coordinates
      const invScale = srcW / dispW;
      const sx = Math.max(0, Math.min(srcW - 1, Math.round(-iLeft * invScale)));
      const sy = Math.max(0, Math.min(srcH - 1, Math.round(-iTop * invScale)));
      const sWidth = Math.min(srcW - sx, Math.round(frame.width * invScale));
      const sHeight = Math.min(srcH - sy, Math.round(frame.height * invScale));

      if (sWidth <= 0 || sHeight <= 0) {
        setDataUrl(rawUploadedUrl);
        setIsCropping(false);
        return;
      }

      // Draw onto 1:1 pixel exact canvas - zero stretch, 100% native camera quality
      const canvas = document.createElement("canvas");
      canvas.width = sWidth;
      canvas.height = sHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setDataUrl(rawUploadedUrl);
        setIsCropping(false);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

      try {
        const croppedUrl = canvas.toDataURL("image/webp", 0.98);
        setDataUrl(croppedUrl);
        setIsCropping(false);
        addToast("تم اقتصاص الجزء بنجاح بأعلى جودة وبدون أي مط! ✨");
      } catch {
        const fallback = canvas.toDataURL("image/jpeg", 0.98);
        setDataUrl(fallback);
        setIsCropping(false);
        addToast("تم اقتصاص الجزء بنجاح بأعلى جودة وبدون أي مط! ✨");
      }
    };
    img.src = rawUploadedUrl;
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
        fitMode,
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
      setRawUploadedUrl("");
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
        fitMode,
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

  const frameDim = getCropFrameNumbers();
  const natW = naturalDimensions.width || 800;
  const natH = naturalDimensions.height || 600;
  const baseScale = Math.max(frameDim.width / natW, frameDim.height / natH);
  const currentScale = baseScale * zoom;
  const displayW = Math.round(natW * currentScale);
  const displayH = Math.round(natH * currentScale);

  const maxPanX = Math.max(0, (displayW - frameDim.width) / 2);
  const maxPanY = Math.max(0, (displayH - frameDim.height) / 2);
  const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, pan.x));
  const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, pan.y));

  const currentImgLeft = Math.round((frameDim.width - displayW) / 2 + clampedPanX);
  const currentImgTop = Math.round((frameDim.height - displayH) / 2 + clampedPanY);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 select-none">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (isCropping) setIsCropping(false);
            else setIsOpen(false);
          }}
          className="absolute inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          className="relative w-full max-w-lg rounded-3xl bg-slate-950/95 border border-white/15 shadow-2xl p-4 sm:p-6 text-white overflow-hidden max-h-[94vh] flex flex-col"
          style={{
            boxShadow: "0 24px 64px rgba(0,0,0,0.85), 0 0 40px rgba(99,102,241,0.22)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                {isCropping ? <Crop className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-lg font-black tracking-wide">
                  {isCropping ? "تحديد واقتصاص الصورة" : "تخصيص صورة الخلفية"}
                </h3>
                <p className="text-xs text-gray-400">
                  {isCropping 
                    ? "اسحب وحرّك الصورة باصبعك لاختيار الجزء الذي تريده بدقة وبدون أي مط" 
                    : "اختر صورتك المفضلة وتحكّم في التباين والعمق"}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (isCropping) setIsCropping(false);
                else setIsOpen(false);
              }}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* CROP MODE INTERFACE (Interactive Touch/Mouse Pan & Zoom)   */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {isCropping && rawUploadedUrl ? (
            <div className="flex-1 flex flex-col overflow-hidden py-3 space-y-3">
              {/* Aspect Ratio Presets */}
              <div className="flex items-center justify-start sm:justify-center gap-1.5 overflow-x-auto pb-1 shrink-0 no-scrollbar">
                <span className="text-[11px] text-gray-400 font-bold ml-1 shrink-0">الأبعاد:</span>
                {(["mobile", "9:16", "3:4", "16:9", "1:1"] as AspectRatioPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setCropAspectRatio(preset);
                      setPan({ x: 0, y: 0 });
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 flex items-center gap-1 ${
                      cropAspectRatio === preset
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "bg-white/5 text-gray-400 hover:text-white border border-white/5"
                    }`}
                  >
                    {preset === "mobile"
                      ? "📱 شاشة هاتفي (تلقائي)"
                      : preset === "9:16"
                      ? "هاتف (9:16)"
                      : preset === "3:4"
                      ? "عمودي (3:4)"
                      : preset === "16:9"
                      ? "أفقي (16:9)"
                      : "مربع (1:1)"}
                  </button>
                ))}
              </div>

              {/* Crop Frame Box */}
              <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-black/60 rounded-2xl border border-white/10 min-h-[260px] max-h-[360px]">
                {/* Crop Viewport Window */}
                <div
                  ref={cropFrameRef}
                  className="relative overflow-hidden border-2 border-indigo-400/80 shadow-2xl rounded-2xl cursor-grab active:cursor-grabbing touch-none select-none transition-all duration-150"
                  style={{
                    width: `${frameDim.width}px`,
                    height: `${frameDim.height}px`,
                    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.75)",
                  }}
                  onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
                  onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
                  onMouseUp={handlePointerUp}
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    if (touch) handlePointerDown(touch.clientX, touch.clientY);
                  }}
                  onTouchMove={(e) => {
                    const touch = e.touches[0];
                    if (touch) handlePointerMove(touch.clientX, touch.clientY);
                  }}
                  onTouchEnd={handlePointerUp}
                >
                  {/* Draggable/Pannable Image with ZERO distortion */}
                  <img
                    ref={cropImgRef}
                    src={rawUploadedUrl}
                    alt="قص الصورة"
                    draggable={false}
                    className="absolute pointer-events-none select-none max-w-none max-h-none"
                    style={{
                      left: `${currentImgLeft}px`,
                      top: `${currentImgTop}px`,
                      width: `${displayW}px`,
                      height: `${displayH}px`,
                      maxWidth: "none",
                      maxHeight: "none",
                    }}
                  />

                  {/* Rule of Thirds Guide Grid */}
                  <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30 border border-white/20">
                    <div className="border-r border-b border-white/30" />
                    <div className="border-r border-b border-white/30" />
                    <div className="border-b border-white/30" />
                    <div className="border-r border-b border-white/30" />
                    <div className="border-r border-b border-white/30" />
                    <div className="border-b border-white/30" />
                    <div className="border-r border-white/30" />
                    <div className="border-r border-white/30" />
                    <div />
                  </div>

                  {/* Drag hint overlay */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-bold text-gray-300 pointer-events-none flex items-center gap-1">
                    <Move className="w-2.5 h-2.5" />
                    <span>اسحب للتحريك</span>
                  </div>
                </div>
              </div>

              {/* Zoom Slider & Reset */}
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10 shrink-0">
                <ZoomIn className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-[11px] text-gray-300 font-bold shrink-0">تكبير:</span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="flex-1 accent-indigo-500 cursor-pointer"
                />
                <span className="text-xs font-mono text-indigo-300 w-8 text-center shrink-0">
                  {zoom.toFixed(1)}x
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0"
                  title="إعادة للمركز"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Crop Actions Footer */}
              <div className="flex items-center gap-2 pt-2 border-t border-white/10 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsCropping(false)}
                  className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-300"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDataUrl(rawUploadedUrl);
                    setFitMode("auto-fit");
                    setIsCropping(false);
                    addToast("تم تطبيق الصورة كاملة بدون قص وتعديل القياس تلقائياً! 📱✨");
                  }}
                  className="px-3 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-black transition-all flex items-center gap-1.5"
                  title="استخدام الصورة كاملة تلقائياً بدون قص مع ملاءمة أبعاد شاشة الهاتف"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>الصورة كاملة تلقائياً</span>
                </button>
                <button
                  type="button"
                  onClick={applyCrop}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-black bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 active:scale-95 transition-all min-w-[130px]"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>تأكيد القص</span>
                </button>
              </div>
            </div>
          ) : (
            /* ═════════════════════════════════════════════════════════════ */
            /* STANDARD PREVIEW & SETTINGS VIEW                            */
            /* ═════════════════════════════════════════════════════════════ */
            <>
              {/* Scope Selector Tabs */}
              <div className="flex p-1 bg-white/5 rounded-2xl my-3 border border-white/10 shrink-0">
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
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
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
                      <div className="absolute inset-0 p-3 sm:p-4 flex flex-col justify-between pointer-events-none">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md">
                            معاينة تناسق العناصر
                          </span>
                          <span className="text-xs font-bold text-indigo-300 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> جودة فائقة
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-indigo-500/40 flex items-center justify-center text-xs font-black">
                            🎧
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black truncate text-white drop-shadow-md">اسم الأغنية أو الفنان</p>
                            <p className="text-[10px] text-gray-300 drop-shadow-sm">وضوح 100% فوق صورتك</p>
                          </div>
                        </div>
                      </div>

                      {/* Hover action overlay: Change or Re-Crop */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => {
                            if (rawUploadedUrl) {
                              setIsCropping(true);
                            } else {
                              setRawUploadedUrl(dataUrl);
                              setIsCropping(true);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-black text-white flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
                        >
                          <Crop className="w-3.5 h-3.5" />
                          <span>قص وتعديل التحديد</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black text-white flex items-center gap-1.5 active:scale-95 transition-all"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>صورة جديدة</span>
                        </button>
                      </div>
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
                          ستتمكن من تحديد وقص الجزء الذي تريده بدقة
                        </p>
                      </div>
                    </button>
                  )}
                </div>

                {/* Adjustments (Only shown if image is selected) */}
                {dataUrl && (
                  <div className="space-y-3.5 pt-1">
                    {/* Quick Crop Button below preview if on mobile */}
                    <button
                      type="button"
                      onClick={() => {
                        setRawUploadedUrl(rawUploadedUrl || dataUrl);
                        setIsCropping(true);
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-xs font-black text-indigo-300 flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                      <Crop className="w-4 h-4 text-indigo-400" />
                      <span>قص وتحديد جزء مختلف من الصورة</span>
                    </button>

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

                    {/* Fit Mode Selector (Auto-fit vs Cover) */}
                    <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="flex items-center gap-1.5 text-gray-300">
                          <Sparkles className="w-4 h-4 text-indigo-400" /> قياس الصورة وحساب الشاشة
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setFitMode("auto-fit")}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                            fitMode === "auto-fit"
                              ? "bg-indigo-600/25 border-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                              : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                          }`}
                        >
                          <span className="font-black text-indigo-300 text-xs">📱 احتواء ذكي (الصورة كاملة)</span>
                          <span className="text-[10px] text-gray-400 text-center leading-tight">
                            تحسب الشاشة بدون مط وتترك مساحة للناف بار والمشغل
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFitMode("cover")}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                            fitMode === "cover"
                              ? "bg-indigo-600/25 border-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                              : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                          }`}
                        >
                          <span className="font-black text-indigo-300 text-xs">🖼️ ملء الشاشة (Cover)</span>
                          <span className="text-[10px] text-gray-400 text-center leading-tight">
                            تمدد كامل لكافة حواف الشاشة مع قص الأطراف الزائدة
                          </span>
                        </button>
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
                          <p className="text-[10px] text-gray-400">حركة سينمائية خفيفة مع السكرول</p>
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
              <div className="pt-3 border-t border-white/10 flex items-center gap-2 shrink-0 mt-2">
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
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
