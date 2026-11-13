import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import {
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  Play,
  FileMusic,
} from "lucide-react-native";
import { Color, Radius, Space } from "@/theme";
import { AuraText, AuraTouch } from "@/ui";
import { Song } from "@/types/music";
import { MusicApi } from "@/services/api/musicApi";
import { upsertSong } from "@/database/db";
import { useDownloadStore } from "@/store/useDownloadStore";
import { useLibraryStore } from "@/store/useLibraryStore";
import { usePlayerStore } from "@/store/usePlayerStore";

interface TelegramImportModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TelegramImportModal({ visible, onClose }: TelegramImportModalProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedSong, setImportedSong] = useState<Song | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  const downloadSong = useDownloadStore((s) => s.downloadSong);
  const loadLibrary = useLibraryStore((s) => s.loadLibrary);
  const playSong = usePlayerStore((s) => s.playSong);

  const handleReset = () => {
    setInput("");
    setError(null);
    setImportedSong(null);
    setIsSaved(false);
    setLoading(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSearchOrImport = async () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError("الرجاء إدخال رابط الأغنية من تيليجرام أو رقم الرسالة");
      return;
    }

    setLoading(true);
    setError(null);
    setImportedSong(null);
    setIsSaved(false);

    try {
      const song = await MusicApi.importTelegramSong(trimmed);
      setImportedSong(song);
    } catch (err: any) {
      setError(err?.message || "لم نتمكن من العثور على الأغنية في تيليجرام. تأكد من الرابط.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!importedSong) return;
    try {
      setLoading(true);
      // 1. Save to local SQLite database
      await upsertSong({
        ...importedSong,
        folderName: "تيليجرام",
      });

      // 2. Queue for offline download
      await downloadSong(importedSong);

      // 3. Refresh user library
      await loadLibrary();

      setIsSaved(true);
    } catch (err: any) {
      setError("حدث خطأ أثناء حفظ الأغنية في المكتبة");
    } finally {
      setLoading(false);
    }
  };

  const handlePlayNow = async () => {
    if (!importedSong) return;
    handleClose();
    await playSong(importedSong);
  };

  const formatDuration = (sec?: number) => {
    if (!sec || isNaN(sec)) return "غير محدد";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.keyboardWrap}
          >
            <View style={styles.card}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerTitleWrap}>
                  <View style={styles.telegramIconBadge}>
                    <Send size={18} color="#2AABEE" style={{ transform: [{ rotate: "-20deg" }] }} />
                  </View>
                  <AuraText style={styles.headerTitle}>استيراد من تيليجرام</AuraText>
                </View>
                <AuraTouch onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <X size={20} color={Color.text_muted} />
                </AuraTouch>
              </View>

              {/* Instructions */}
              <AuraText style={styles.description}>
                حمل الأغنية في قناتك على تيليجرام أو قناة Aura، ثم انسخ رابط الرسالة أو رقمها هنا لإضافتها مباشرة لمكتبتك بدون إنترنت.
              </AuraText>

              {/* Input box */}
              <View style={styles.inputContainer}>
                <TextInput
                  value={input}
                  onChangeText={(val) => {
                    setInput(val);
                    if (error) setError(null);
                  }}
                  placeholder="https://t.me/c/.../123 أو رقم الرسالة"
                  placeholderTextColor={Color.text_muted}
                  style={styles.textInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={handleSearchOrImport}
                />
                {input.length > 0 && (
                  <AuraTouch onPress={() => setInput("")} style={styles.clearBtn}>
                    <X size={16} color={Color.text_secondary} />
                  </AuraTouch>
                )}
              </View>

              {/* Error Message */}
              {error && (
                <View style={styles.errorBox}>
                  <AlertCircle size={16} color="#EF4444" />
                  <AuraText style={styles.errorText}>{error}</AuraText>
                </View>
              )}

              {/* Search / Action Button */}
              {!importedSong && (
                <AuraTouch
                  onPress={handleSearchOrImport}
                  style={[styles.primaryBtn, (!input.trim() || loading) && styles.disabledBtn]}
                  disabled={!input.trim() || loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Send size={16} color="#000" style={{ transform: [{ rotate: "-20deg" }] }} />
                      <AuraText style={styles.primaryBtnText}>فحص واستيراد الأغنية</AuraText>
                    </>
                  )}
                </AuraTouch>
              )}

              {/* Song Preview Card */}
              {importedSong && (
                <View style={styles.previewCard}>
                  <View style={styles.previewInfoRow}>
                    <View style={styles.musicIconWrap}>
                      <FileMusic size={26} color={Color.gold500} />
                    </View>
                    <View style={styles.songMeta}>
                      <AuraText style={styles.songTitle} lines={1}>
                        {importedSong.title}
                      </AuraText>
                      <AuraText style={styles.songArtist} lines={1}>
                        {importedSong.artist} • {formatDuration(importedSong.duration)}
                      </AuraText>
                    </View>
                  </View>

                  {/* Actions after finding the song */}
                  {isSaved ? (
                    <View style={styles.savedBadgeRow}>
                      <CheckCircle2 size={18} color="#10B981" />
                      <AuraText style={styles.savedBadgeText}>
                        تمت الإضافة للمكتبة وجارٍ التحميل للاستماع بدون نت!
                      </AuraText>
                    </View>
                  ) : (
                    <AuraTouch
                      onPress={handleSaveToLibrary}
                      style={styles.saveBtn}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color="#000" />
                      ) : (
                        <>
                          <Download size={16} color="#000" />
                          <AuraText style={styles.saveBtnText}>إضافة للمكتبة وتحميل بدون نت</AuraText>
                        </>
                      )}
                    </AuraTouch>
                  )}

                  <AuraTouch onPress={handlePlayNow} style={styles.playNowBtn}>
                    <Play size={15} color={Color.gold300} fill={Color.gold300} />
                    <AuraText style={styles.playNowText}>تشغيل الأغنية الآن</AuraText>
                  </AuraTouch>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: Space.s4,
  },
  keyboardWrap: {
    width: "100%",
    maxWidth: 420,
  },
  card: {
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
  telegramIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(42, 171, 238, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(42, 171, 238, 0.3)",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Color.text_primary,
  },
  description: {
    fontSize: 12,
    color: Color.text_muted,
    lineHeight: 18,
    textAlign: "right",
    marginBottom: Space.s4,
  },
  inputContainer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#202020",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: Space.s3,
    marginBottom: Space.s3,
  },
  textInput: {
    flex: 1,
    height: 44,
    color: Color.text_primary,
    fontSize: 14,
    textAlign: "right",
  },
  clearBtn: {
    padding: 6,
  },
  errorBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Space.s2,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderRadius: Radius.md,
    padding: Space.s2,
    marginBottom: Space.s3,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: "#EF4444",
    textAlign: "right",
  },
  primaryBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    backgroundColor: Color.gold500,
    borderRadius: Radius.md,
    paddingVertical: 12,
  },
  disabledBtn: {
    opacity: 0.45,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
  },
  previewCard: {
    backgroundColor: "#1D1D1D",
    borderRadius: Radius.lg,
    padding: Space.s3,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.15)",
    gap: Space.s3,
  },
  previewInfoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Space.s3,
  },
  musicIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.25)",
  },
  songMeta: {
    flex: 1,
    alignItems: "flex-end",
  },
  songTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Color.text_primary,
    marginBottom: 2,
    textAlign: "right",
  },
  songArtist: {
    fontSize: 12,
    color: Color.text_muted,
    textAlign: "right",
  },
  savedBadgeRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  savedBadgeText: {
    fontSize: 12,
    color: "#10B981",
    fontWeight: "600",
    textAlign: "right",
  },
  saveBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    backgroundColor: Color.gold500,
    borderRadius: Radius.md,
    paddingVertical: 10,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#000",
  },
  playNowBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    borderRadius: Radius.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  playNowText: {
    fontSize: 12,
    fontWeight: "600",
    color: Color.gold300,
  },
});
