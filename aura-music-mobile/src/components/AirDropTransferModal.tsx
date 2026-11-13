import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import {
  Radio,
  X,
  Share2,
  DownloadCloud,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  ExternalLink,
  Layers,
  Sparkles,
} from "lucide-react-native";
import { Color, Radius, Space } from "@/theme";
import { AuraText, AuraTouch } from "@/ui";
import {
  downloadLibraryBackup,
  pickAndImportLibrary,
  shareAppIpaViaAirDrop,
  type BackupProgress,
} from "@/services/offline/backupTransfer";
import { useLibraryStore } from "@/store/useLibraryStore";

interface AirDropTransferModalProps {
  visible: boolean;
  onClose: () => void;
  songsCount: number;
  totalSizeMB: number;
  onSuccess?: () => void;
}

export function AirDropTransferModal({
  visible,
  onClose,
  songsCount,
  totalSizeMB,
  onSuccess,
}: AirDropTransferModalProps) {
  const [tab, setTab] = useState<"songs" | "app">("songs");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadLibrary = useLibraryStore((s) => s.loadLibrary);

  const handleExportAllAirDrop = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const fileName = await downloadLibraryBackup((p) => {
        setProgress(p);
      });
      setStatusMessage(`تم تجهيز ملف الأغاني (${fileName}). اختر الآيفون الآخر من قائمة AirDrop!`);
    } catch (err: any) {
      setErrorMessage(err?.message || "حدث خطأ أثناء تجهيز ملف الأغاني.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportAirDropPack = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result = await pickAndImportLibrary((p) => setProgress(p));
      if (result) {
        await loadLibrary();
        setStatusMessage(`تم بنجاح استيراد ${result.importedCount} أغنية إلى مكتبتك الأوفلاين! 🎉`);
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "فشل استيراد الملف. تأكد من أنه ملف .aurapack سليم.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShareIpa = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const ok = await shareAppIpaViaAirDrop();
      if (ok) {
        setStatusMessage("اختر الآيفون الآخر من قائمة AirDrop لإرسال ملف التطبيق (AuraMusic.ipa)!");
      } else {
        setErrorMessage("مشاركة ملف الـ IPA تتطلب العمل على جهاز آيفون حقيقي.");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "تعذر بدء مشاركة ملف الـ IPA.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <View style={styles.airdropIconBadge}>
                <Radio size={18} color={Color.gold500} />
              </View>
              <AuraText style={styles.headerTitle}>نقل الأغاني والتطبيق عبر AirDrop</AuraText>
            </View>
            <AuraTouch onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color={Color.text_muted} />
            </AuraTouch>
          </View>

          {/* Segmented Tabs */}
          <View style={styles.tabBar}>
            <AuraTouch
              onPress={() => setTab("songs")}
              style={[styles.tabItem, tab === "songs" && styles.tabItemActive]}
            >
              <AuraText style={[styles.tabText, tab === "songs" && styles.tabTextActive]}>
                مشاركة الأغاني
              </AuraText>
            </AuraTouch>
            <AuraTouch
              onPress={() => setTab("app")}
              style={[styles.tabItem, tab === "app" && styles.tabItemActive]}
            >
              <AuraText style={[styles.tabText, tab === "app" && styles.tabTextActive]}>
                تثبيت التطبيق على آيفون آخر
              </AuraText>
            </AuraTouch>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {statusMessage && (
              <View style={styles.statusBox}>
                <CheckCircle2 size={16} color="#10B981" />
                <AuraText style={styles.statusText}>{statusMessage}</AuraText>
              </View>
            )}

            {errorMessage && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color="#EF4444" />
                <AuraText style={styles.errorText}>{errorMessage}</AuraText>
              </View>
            )}

            {isProcessing && progress && (
              <View style={styles.progressBox}>
                <View style={styles.progressMeta}>
                  <AuraText style={styles.progressTitle}>
                    {progress.phase === "exporting" ? "جارٍ تجهيز وحزم الأغاني..." : "جارٍ نقل واستيراد الأغاني..."}
                  </AuraText>
                  <AuraText style={styles.progressPercent}>{progress.percentage}%</AuraText>
                </View>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${progress.percentage}%` }]} />
                </View>
                <AuraText style={styles.progressCurrent} lines={1}>
                  {progress.currentSongTitle} ({progress.current}/{progress.total})
                </AuraText>
              </View>
            )}

            {tab === "songs" ? (
              <View style={styles.sectionWrap}>
                <View style={styles.infoBanner}>
                  <Radio size={20} color={Color.gold500} />
                  <AuraText style={styles.infoText}>
                    شارك جميع أغانيك الأوفلاين ({songsCount} أغنية • {totalSizeMB.toFixed(1)} MB) مباشرة إلى أي آيفون بجانبك بسرعة فائقة عبر Wi-Fi / AirDrop وبدون استهلاك للإنترنت!
                  </AuraText>
                </View>

                {/* Primary Button */}
                <AuraTouch
                  onPress={handleExportAllAirDrop}
                  style={styles.actionBtn}
                  disabled={isProcessing || songsCount === 0}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Share2 size={18} color="#000" />
                      <AuraText style={styles.actionBtnText}>
                        📡 إرسال كل الأغاني دفعة واحدة عبر AirDrop
                      </AuraText>
                    </>
                  )}
                </AuraTouch>

                {/* Secondary Button: Import */}
                <AuraTouch
                  onPress={handleImportAirDropPack}
                  style={styles.secondaryBtn}
                  disabled={isProcessing}
                >
                  <DownloadCloud size={17} color={Color.gold300} />
                  <AuraText style={styles.secondaryBtnText}>
                    📥 استيراد حزمة أغانٍ تم استقبالها (.aurapack)
                  </AuraText>
                </AuraTouch>

                <View style={styles.tipsBox}>
                  <AuraText style={styles.tipsTitle}>💡 كيف تعمل الميزة عند الطرف الآخر؟</AuraText>
                  <AuraText style={styles.tipsBody}>
                    1. اضغط "إرسال كل الأغاني عبر AirDrop" واختر اسم هاتف صديقك.{"\n"}
                    2. في هاتف صديقك يظهر إشعار AirDrop $\rightarrow$ يضغط "قبول" (Accept).{"\n"}
                    3. سيفتح تطبيق Aura Music تلقائياً ويضيف جميع الأغاني إلى مكتبته فوراً!
                  </AuraText>
                </View>
              </View>
            ) : (
              <View style={styles.sectionWrap}>
                {/* Method 1: Instant PWA without Sideloadly */}
                <View style={styles.methodCard}>
                  <View style={styles.methodHeader}>
                    <Sparkles size={18} color={Color.gold500} />
                    <AuraText style={styles.methodTitle}>
                      الطريقة 1: تثبيت فوري بدون كمبيوتر وبدون Sideloadly (موصى بها)
                    </AuraText>
                  </View>
                  <AuraText style={styles.methodDesc}>
                    يمكنك تشغيل وتثبيت التطبيق على أي آيفون في 10 ثوانٍ فقط بدون الحاجة لكمبيوتر أو تجديد أسبوعي:
                  </AuraText>
                  <View style={styles.stepsList}>
                    <AuraText style={styles.stepItem}>
                      1. افتح متصفح Safari على الآيفون الثاني وادخل على الرابط:{"\n"}
                      <AuraText style={{ color: Color.gold300, fontWeight: "700" }}>
                        https://aura-musiic.vercel.app
                      </AuraText>
                    </AuraText>
                    <AuraText style={styles.stepItem}>
                      2. اضغط على زر المشاركة (Share ⬆️) في أسفل المتصفح.
                    </AuraText>
                    <AuraText style={styles.stepItem}>
                      3. اختر "إضافة إلى الشاشة الرئيسية" (Add to Home Screen).
                    </AuraText>
                    <AuraText style={styles.stepItem}>
                      4. سيظهر تطبيق Aura Music على شاشة الآيفون ويعمل للأبد بكامل ميزاته مع تشغيل في الخلفية ومحرك الصوت!
                    </AuraText>
                  </View>
                </View>

                {/* Method 2: Share IPA via AirDrop */}
                <View style={styles.methodCard}>
                  <View style={styles.methodHeader}>
                    <Smartphone size={18} color={Color.gold500} />
                    <AuraText style={styles.methodTitle}>
                      الطريقة 2: إرسال ملف التطبيق (IPA) عبر AirDrop
                    </AuraText>
                  </View>
                  <AuraText style={styles.methodDesc}>
                    أرسل ملف التطبيق كاملاً (AuraMusic.ipa) عبر AirDrop للآيفون الآخر لتثبيته مباشرة عبر SideStore أو Scarlet أو TrollStore دون الحاجة لتوصيل كابل الكمبيوتر:
                  </AuraText>

                  <AuraTouch
                    onPress={handleShareIpa}
                    style={styles.ipaBtn}
                    disabled={isProcessing}
                  >
                    <Share2 size={16} color="#000" />
                    <AuraText style={styles.ipaBtnText}>
                      📡 إرسال ملف (AuraMusic.ipa) عبر AirDrop
                    </AuraText>
                  </AuraTouch>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: Space.s4,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
    backgroundColor: "#161616",
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
    padding: Space.s4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Space.s3,
  },
  headerTitleWrap: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Space.s2,
  },
  airdropIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Color.text_primary,
  },
  tabBar: {
    flexDirection: "row-reverse",
    backgroundColor: "#202020",
    borderRadius: Radius.md,
    padding: 3,
    marginBottom: Space.s3,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.sm,
  },
  tabItemActive: {
    backgroundColor: "rgba(255, 215, 0, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  tabText: {
    fontSize: 12,
    color: Color.text_muted,
    fontWeight: "600",
  },
  tabTextActive: {
    color: Color.gold300,
    fontWeight: "700",
  },
  body: {
    paddingBottom: Space.s2,
  },
  sectionWrap: {
    gap: Space.s3,
  },
  infoBanner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Space.s3,
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    borderRadius: Radius.md,
    padding: Space.s3,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.15)",
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: Color.text_secondary,
    lineHeight: 18,
    textAlign: "right",
  },
  actionBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    backgroundColor: Color.gold500,
    borderRadius: Radius.md,
    paddingVertical: 13,
    shadowColor: Color.gold500,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
  },
  secondaryBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: Radius.md,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Color.text_primary,
  },
  tipsBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: Radius.md,
    padding: Space.s3,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    gap: 4,
  },
  tipsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Color.gold300,
    textAlign: "right",
    marginBottom: 2,
  },
  tipsBody: {
    fontSize: 11,
    color: Color.text_muted,
    lineHeight: 18,
    textAlign: "right",
  },
  methodCard: {
    backgroundColor: "#1D1D1D",
    borderRadius: Radius.lg,
    padding: Space.s3,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.12)",
    gap: Space.s2,
  },
  methodHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Space.s2,
  },
  methodTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Color.gold300,
    flex: 1,
    textAlign: "right",
  },
  methodDesc: {
    fontSize: 12,
    color: Color.text_muted,
    lineHeight: 18,
    textAlign: "right",
  },
  stepsList: {
    backgroundColor: "#161616",
    borderRadius: Radius.sm,
    padding: Space.s3,
    gap: 6,
  },
  stepItem: {
    fontSize: 11,
    color: Color.text_secondary,
    lineHeight: 17,
    textAlign: "right",
  },
  ipaBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    backgroundColor: Color.gold500,
    borderRadius: Radius.md,
    paddingVertical: 10,
    marginTop: 4,
  },
  ipaBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#000",
  },
  statusBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Space.s2,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderRadius: Radius.md,
    padding: Space.s3,
    marginBottom: Space.s2,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    color: "#10B981",
    textAlign: "right",
  },
  errorBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Space.s2,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderRadius: Radius.md,
    padding: Space.s3,
    marginBottom: Space.s2,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: "#EF4444",
    textAlign: "right",
  },
  progressBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: Radius.md,
    padding: Space.s3,
    marginBottom: Space.s3,
    gap: 6,
  },
  progressMeta: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Color.text_primary,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: "700",
    color: Color.gold500,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: "#333",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Color.gold500,
    borderRadius: 3,
  },
  progressCurrent: {
    fontSize: 11,
    color: Color.text_muted,
    textAlign: "right",
  },
});

