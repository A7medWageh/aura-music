import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Platform,
  ActivityIndicator,
} from "react-native";
import {
  DownloadCloud,
  UploadCloud,
  X,
  FileCheck2,
  HardDrive,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Smartphone,
} from "lucide-react-native";
import { Color, Radius, Space, Type } from "@/theme";
import { AuraText, AuraTouch } from "@/ui";
import {
  downloadLibraryBackup,
  importOfflineLibrary,
  pickAndImportLibrary,
  type BackupProgress,
} from "@/services/offline/backupTransfer";
import { useLibraryStore } from "@/store/useLibraryStore";

interface LibraryBackupModalProps {
  visible: boolean;
  onClose: () => void;
  songsCount: number;
  totalSizeMB: number;
  onSuccess?: () => void;
}

export const LibraryBackupModal: React.FC<LibraryBackupModalProps> = ({
  visible,
  onClose,
  songsCount,
  totalSizeMB,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!visible) return null;

  const handleStartExport = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const fileName = await downloadLibraryBackup((p) => {
        setProgress(p);
      });
      setStatusMessage(
        Platform.OS === "web"
          ? `تم تجهيز وتنزيل ملف الأغاني (${fileName}) بنجاح!`
          : `تم تجهيز ملف النسخة الاحتياطية — احفظه من قائمة المشاركة أو أرسله لجهازك الآخر.`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || "حدث خطأ أثناء تجهيز ملف الأغاني.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectFile = async () => {
    if (isProcessing) return;

    if (Platform.OS === "web") {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        fileInputRef.current.click();
      }
      return;
    }

    setIsProcessing(true);
    setProgress(null);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result = await pickAndImportLibrary((p) => setProgress(p));
      if (result) {
        await useLibraryStore.getState().loadLibrary();
        setStatusMessage(
          `تم بنجاح نقل واستيراد ${result.importedCount} أغنية إلى مكتبة الأوفلاين!`
        );
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "فشل استيراد الملف. تأكد من أنه ملف .aurapack سليم.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result = await importOfflineLibrary(file, (p) => {
        setProgress(p);
      });

      await useLibraryStore.getState().loadLibrary();
      setStatusMessage(`تم بنجاح نقل واستيراد ${result.importedCount} أغنية إلى مكتبة الأوفلاين! 🚀`);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err?.message || "فشل استيراد الملف. تأكد من أنه ملف .aurapack سليم.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Hidden Web file input for selecting .aurapack files */}
        {Platform.OS === "web" && (
          <input
            ref={fileInputRef as any}
            type="file"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: "none",
            }}
            onChange={handleFileChange as any}
          />
        )}

        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIcon}>
                <Smartphone size={18} color={Color.gold500} />
              </View>
              <View>
                <AuraText role="titleSm" color={Color.text_primary} style={{ fontWeight: "700" }}>
                  نقل وتصدير الأغاني
                </AuraText>
                <AuraText role="tiny" color={Color.text_muted}>
                  نقل أغانيك المحفوظة بدون إنترنت
                </AuraText>
              </View>
            </View>

            <AuraTouch feedback="selection" onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={Color.text_muted} />
            </AuraTouch>
          </View>

          {/* Segment Tabs */}
          <View style={styles.tabTrack}>
            <AuraTouch
              feedback="selection"
              onPress={() => {
                setActiveTab("export");
                setErrorMessage(null);
                setStatusMessage(null);
              }}
              style={[styles.tabItem, activeTab === "export" && styles.tabItemActive]}
            >
              <UploadCloud size={14} color={activeTab === "export" ? Color.gold500 : Color.text_muted} />
              <AuraText
                role="label"
                color={activeTab === "export" ? Color.gold100 : Color.text_muted}
                style={{ fontWeight: activeTab === "export" ? "700" : "500", fontSize: 13 }}
              >
                تصدير نسخة (.aurapack)
              </AuraText>
            </AuraTouch>

            <AuraTouch
              feedback="selection"
              onPress={() => {
                setActiveTab("import");
                setErrorMessage(null);
                setStatusMessage(null);
              }}
              style={[styles.tabItem, activeTab === "import" && styles.tabItemActive]}
            >
              <DownloadCloud size={14} color={activeTab === "import" ? Color.gold500 : Color.text_muted} />
              <AuraText
                role="label"
                color={activeTab === "import" ? Color.gold100 : Color.text_muted}
                style={{ fontWeight: activeTab === "import" ? "700" : "500", fontSize: 13 }}
              >
                استيراد أغانٍ للتطبيق
              </AuraText>
            </AuraTouch>
          </View>

          {/* Tab 1: Export */}
          {activeTab === "export" && (
            <View style={styles.body}>
              <View style={styles.infoBanner}>
                <HardDrive size={18} color={Color.gold500} />
                <View style={{ flex: 1 }}>
                  <AuraText role="label" color={Color.text_primary}>
                    جاهز لتصدير {songsCount} أغنية
                  </AuraText>
                  <AuraText role="tiny" color={Color.text_muted}>
                    إجمالي الحجم: {totalSizeMB.toFixed(1)} ميجابايت مع الملفات الصوتية والكلمات
                  </AuraText>
                </View>
              </View>

              <AuraText role="caption" color={Color.text_secondary} style={{ lineHeight: 20 }}>
                تتيح لك هذه الميزة تجميع كافة أغانيك المحمّلة في ملف واحد بصيغة (.aurapack)، لتتمكن من نقله بسهولة إلى هاتفك أو فتحه في أي متصفح آخر دون الحاجة لتحميل الأغاني من جديد!
              </AuraText>

              {isProcessing && progress && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressMeta}>
                    <AuraText role="tiny" color={Color.gold300} style={{ fontWeight: "600" }}>
                      جارٍ تجهيز: {progress.currentSongTitle}
                    </AuraText>
                    <AuraText role="tiny" color={Color.gold500}>
                      {progress.percentage}%
                    </AuraText>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${progress.percentage}%` }]} />
                  </View>
                </View>
              )}

              {statusMessage && (
                <View style={styles.successBanner}>
                  <CheckCircle2 size={16} color={Color.state_success} />
                  <AuraText role="tiny" color={Color.state_success} style={{ flex: 1 }}>
                    {statusMessage}
                  </AuraText>
                </View>
              )}

              {errorMessage && (
                <View style={styles.errorBanner}>
                  <AlertCircle size={16} color={Color.state_danger} />
                  <AuraText role="tiny" color={Color.state_danger} style={{ flex: 1 }}>
                    {errorMessage}
                  </AuraText>
                </View>
              )}

              <AuraTouch
                feedback="impact"
                pressedScale={0.97}
                onPress={handleStartExport}
                disabled={isProcessing || songsCount === 0}
                style={[styles.primaryBtn, (isProcessing || songsCount === 0) && styles.btnDisabled]}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color={Color.ink0} />
                ) : (
                  <UploadCloud size={17} color={Color.ink0} strokeWidth={2.5} />
                )}
                <AuraText role="label" color={Color.ink0} style={{ fontWeight: "700" }}>
                  {isProcessing ? "جارٍ تجهيز الملف..." : "تصدير الأغاني الآن"}
                </AuraText>
              </AuraTouch>
            </View>
          )}

          {/* Tab 2: Import */}
          {activeTab === "import" && (
            <View style={styles.body}>
              <View style={styles.infoBanner}>
                <FileCheck2 size={18} color={Color.gold500} />
                <View style={{ flex: 1 }}>
                  <AuraText role="label" color={Color.text_primary}>
                    استيراد ملف (.aurapack)
                  </AuraText>
                  <AuraText role="tiny" color={Color.text_muted}>
                    اختر الملف من جهازك ليتم حفظ كل محتوياته في الأوفلاين فوراً
                  </AuraText>
                </View>
              </View>

              <AuraText role="caption" color={Color.text_secondary} style={{ lineHeight: 20 }}>
                إذا كنت تملك ملف (.aurapack) قمت بتصديره من الكمبيوتر أو هاتف آخر، اضغط بالأسفل لاختياره وسيتم تفريغ وتشغيل كل الأغاني مباشرة في تطبيقك أوفلاين.
              </AuraText>

              {isProcessing && progress && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressMeta}>
                    <AuraText role="tiny" color={Color.gold300} style={{ fontWeight: "600" }}>
                      جارٍ استيراد: {progress.currentSongTitle}
                    </AuraText>
                    <AuraText role="tiny" color={Color.gold500}>
                      {progress.percentage}%
                    </AuraText>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${progress.percentage}%` }]} />
                  </View>
                </View>
              )}

              {statusMessage && (
                <View style={styles.successBanner}>
                  <CheckCircle2 size={16} color={Color.state_success} />
                  <AuraText role="tiny" color={Color.state_success} style={{ flex: 1 }}>
                    {statusMessage}
                  </AuraText>
                </View>
              )}

              {errorMessage && (
                <View style={styles.errorBanner}>
                  <AlertCircle size={16} color={Color.state_danger} />
                  <AuraText role="tiny" color={Color.state_danger} style={{ flex: 1 }}>
                    {errorMessage}
                  </AuraText>
                </View>
              )}

              <AuraTouch
                feedback="impact"
                pressedScale={0.97}
                onPress={handleSelectFile}
                disabled={isProcessing}
                style={[styles.primaryBtn, isProcessing && styles.btnDisabled]}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color={Color.ink0} />
                ) : (
                  <DownloadCloud size={17} color={Color.ink0} strokeWidth={2.5} />
                )}
                <AuraText role="label" color={Color.ink0} style={{ fontWeight: "700" }}>
                  {isProcessing ? "جارٍ الاستيراد..." : "اختيار ملف .aurapack"}
                </AuraText>
              </AuraTouch>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: Space.s4,
    zIndex: 99999,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "rgba(18,15,13,0.98)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    padding: Space.s4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.8,
    shadowRadius: 32,
    elevation: 24,
    gap: Space.s3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Color.veil_hairline,
    paddingBottom: Space.s3,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_goldTint,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    padding: 6,
    borderRadius: Radius.pill,
  },
  tabTrack: {
    flexDirection: "row",
    backgroundColor: Color.ink2,
    borderRadius: Radius.md,
    padding: 3,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: Radius.sm,
    gap: 6,
  },
  tabItemActive: {
    backgroundColor: Color.ink0,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  body: {
    gap: Space.s3,
    marginTop: Space.s1,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    backgroundColor: "rgba(226,177,60,0.08)",
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    borderRadius: Radius.lg,
    padding: Space.s3,
  },
  progressContainer: {
    gap: 4,
    marginTop: Space.s1,
  },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressBarTrack: {
    height: 6,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Color.gold500,
    borderRadius: Radius.pill,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
    padding: Space.s2,
    borderRadius: Radius.md,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    padding: Space.s2,
    borderRadius: Radius.md,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    backgroundColor: Color.gold500,
    borderRadius: Radius.pill,
    paddingVertical: 12,
    marginTop: Space.s2,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

