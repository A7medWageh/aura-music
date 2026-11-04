import React, { useMemo, useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Headphones,
  Music2,
  Disc3,
  Heart,
  Play,
  HardDrive,
  Crown,
  LogIn,
  LogOut,
  Sparkles,
  Key,
  Send,
  Check,
  Copy,
  ShieldCheck,
  UserCheck,
} from "lucide-react-native";

import { getSafeTopInset } from "@/utils/safeArea";
import { Color, Gradient, Radius, Space } from "@/theme";
import { useLibraryStore } from "@/store/useLibraryStore";
import { usePlayerStore } from "@/store/usePlayerStore";
import {
  useAuthStore,
  MASTER_ADMIN_EMAIL,
  SubscriptionDuration,
  DURATION_LABELS,
  GeneratedPromoCode,
  GrantedSubscription,
} from "@/store/useAuthStore";
import { MusicApi } from "@/services/api/musicApi";
import { resolveArtworkUri } from "@/utils/media";
import { PLACEHOLDER_SONG } from "@/constants/placeholders";
import {
  AuraArtwork,
  AuraBadge,
  AuraCanvas,
  AuraChip,
  AuraHairline,
  AuraKicker,
  AuraPlayPulse,
  AuraSurface,
  AuraText,
  AuraTouch,
  AuraPageTransition,
  useDockClearance,
} from "@/ui";

const absFill = StyleSheet.absoluteFill as any;

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = getSafeTopInset(insets.top);
  const [user, setUser] = React.useState<any>(null);
  const downloadedSongs = useLibraryStore((s) => s.downloadedSongs);
  const favorites = useLibraryStore((s) => s.favorites);
  const recentSongs = useLibraryStore((s) => s.recentSongs);
  const playSong = usePlayerStore((s) => s.playSong);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const dockClearance = useDockClearance();

  const authUser = useAuthStore((s) => s.user);
  const isPremium = useAuthStore((s) => s.isPremium);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const setAuthModalVisible = useAuthStore((s) => s.setAuthModalVisible);
  const setPremiumModalVisible = useAuthStore((s) => s.setPremiumModalVisible);

  const isMaster =
    authUser?.email?.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() ||
    authUser?.role === "admin";
  const generatePromoCode = useAuthStore((s) => s.generatePromoCode);
  const getGeneratedPromoCodes = useAuthStore((s) => s.getGeneratedPromoCodes);
  const grantSubscriptionToEmail = useAuthStore((s) => s.grantSubscriptionToEmail);
  const getGrantedSubscriptions = useAuthStore((s) => s.getGrantedSubscriptions);
  const activateMasterAccount = useAuthStore((s) => s.activateMasterAccount);

  // Master Admin state
  const [selectedPromoDuration, setSelectedPromoDuration] = useState<SubscriptionDuration>("3m");
  const [lastGeneratedCode, setLastGeneratedCode] = useState<string | null>(null);
  const [generatedList, setGeneratedList] = useState<GeneratedPromoCode[]>([]);
  const [targetEmail, setTargetEmail] = useState("");
  const [selectedGrantDuration, setSelectedGrantDuration] = useState<SubscriptionDuration>("1y");
  const [grantMessage, setGrantMessage] = useState<string | null>(null);
  const [grantedList, setGrantedList] = useState<GrantedSubscription[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);

  const loadAdminData = React.useCallback(async () => {
    if (!isMaster) return;
    const [codes, subs] = await Promise.all([
      getGeneratedPromoCodes(),
      getGrantedSubscriptions(),
    ]);
    setGeneratedList(codes);
    setGrantedList(subs);
  }, [isMaster, getGeneratedPromoCodes, getGrantedSubscriptions]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleGenerateCode = async () => {
    const res = await generatePromoCode(selectedPromoDuration);
    if (res.success) {
      setLastGeneratedCode(res.code);
      setCopiedCode(false);
      loadAdminData();
    }
  };

  const handleGrantSubscription = async () => {
    if (!targetEmail.trim()) return;
    const res = await grantSubscriptionToEmail(targetEmail, selectedGrantDuration);
    setGrantMessage(res.message);
    if (res.success) {
      setTargetEmail("");
      loadAdminData();
      setTimeout(() => setGrantMessage(null), 5000);
    }
  };

  React.useEffect(() => {
    MusicApi.getCurrentUser().then(setUser).catch(() => {});
  }, []);

  const activeName = (authUser?.displayName || user?.displayName || "").trim();
  const activeEmail = authUser?.email || "";
  const monogram = activeName ? activeName.slice(0, 1).toUpperCase() : "A";

  const totalPlays = recentSongs.reduce((acc, s) => acc + (s.playCount || 1), 0);
  const uniqueArtists = new Set(
    [...downloadedSongs, ...favorites, ...recentSongs].map((s) => s.artist).filter(Boolean),
  ).size;
  const offlineMB = downloadedSongs.reduce((acc, s) => acc + (s.fileSize || 3600000), 0) / (1024 * 1024);

  const topArtists = useMemo(() => {
    const tally = new Map<string, number>();
    for (const s of [...recentSongs, ...favorites, ...downloadedSongs]) {
      const name = (s.artist || "").trim();
      if (!name) continue;
      tally.set(name, (tally.get(name) || 0) + (s.playCount || 1));
    }
    return Array.from(tally.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [recentSongs, favorites, downloadedSongs]);

  return (
    <AuraPageTransition style={styles.root}>
      <AuraCanvas intensity="ember" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topInset + Space.s1, paddingBottom: dockClearance + Space.s5 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── IDENTITY & AUTH ── */}
        <View style={styles.hero}>
          <View style={styles.avatarSlot}>
            <LinearGradient colors={isPremium ? ["#E2B13C", "#C08F24"] : Gradient.signature} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.avatar}>
              <AuraText role="display" color={Color.text_onBrand}>
                {monogram}
              </AuraText>
            </LinearGradient>
            <View style={[styles.avatarRing, isPremium && { borderColor: Color.gold500 }]} />
          </View>

          <View style={styles.heroCopy}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: Space.s2 }}>
              <AuraKicker>الملف الشخصي</AuraKicker>
              {isPremium && <AuraBadge label="VIP" tone="gold" />}
            </View>
            <AuraText role="displaySm" lines={1}>
              {activeName || "ضيف Aura Music"}
            </AuraText>
            <View style={styles.heroMeta}>
              <AuraText role="caption" color={Color.text_secondary}>
                {activeEmail || (activeName ? "حساب متصل" : "استخدام محلي دون تسجيل")}
              </AuraText>
              <AuraBadge label={downloadedSongs.length > 0 ? "دون اتصال" : "متصل"} tone={downloadedSongs.length > 0 ? "live" : "quiet"} />
            </View>
          </View>
        </View>

        {/* ── AUTH ACTIONS ── */}
        <View style={styles.authRow}>
          {isAuthenticated ? (
            <>
              <AuraTouch
                feedback="selection"
                onPress={() => setPremiumModalVisible(true)}
                style={[styles.authBtn, styles.vipAuthBtn]}
              >
                <Crown size={15} color={Color.gold500} />
                <AuraText role="label" color={Color.gold300}>
                  {isPremium ? "عضوية VIP نشطة" : "ترقية إلى VIP"}
                </AuraText>
              </AuraTouch>
              <AuraTouch
                feedback="selection"
                onPress={logout}
                style={[styles.authBtn, styles.logoutBtn]}
              >
                <LogOut size={15} color={Color.state_danger} />
                <AuraText role="label" color={Color.state_danger}>
                  تسجيل الخروج
                </AuraText>
              </AuraTouch>
            </>
          ) : (
            <>
              <AuraTouch
                feedback="selection"
                onPress={() => setAuthModalVisible(true)}
                style={[styles.authBtn, styles.loginAuthBtn]}
              >
                <LogIn size={15} color={Color.ink0} />
                <AuraText role="bodyStrong" color={Color.ink0}>
                  تسجيل الدخول / حساب جديد
                </AuraText>
              </AuraTouch>
              <AuraTouch
                feedback="selection"
                onPress={() => setPremiumModalVisible(true)}
                style={[styles.authBtn, styles.vipAuthBtn]}
              >
                <Crown size={15} color={Color.gold500} />
                <AuraText role="label" color={Color.gold300}>
                  تفعيل VIP
                </AuraText>
              </AuraTouch>
            </>
          )}
        </View>

        {/* ── MASTER ADMIN SWITCH (If not currently master) ── */}
        {!isMaster && (
          <AuraTouch
            feedback="selection"
            onPress={activateMasterAccount}
            style={styles.masterSwitchBtn}
          >
            <ShieldCheck size={15} color={Color.gold500} />
            <AuraText role="tiny" color={Color.gold300}>
              تسجيل الدخول كمدير النظام ({MASTER_ADMIN_EMAIL})
            </AuraText>
          </AuraTouch>
        )}

        {/* ── MASTER ADMIN VIP CONTROL CONSOLE (Visible to Master Admin) ── */}
        {isMaster && (
          <View style={styles.adminConsoleWrap}>
            <LinearGradient
              colors={["rgba(226,177,60,0.18)", "rgba(16,13,11,0.98)"]}
              style={styles.adminConsoleHeader}
            >
              <View style={styles.adminTitleRow}>
                <View style={styles.adminCrownBadge}>
                  <Crown size={16} color={Color.gold500} />
                </View>
                <View style={{ flex: 1 }}>
                  <AuraText role="title" color={Color.gold100} style={{ fontSize: 16 }}>
                    لوحة تحكم المدير (VIP Console)
                  </AuraText>
                  <AuraText role="tiny" color={Color.text_muted}>
                    توليد أكواد الترقية وتفعيل الاشتراكات لحسابات المستخدمين
                  </AuraText>
                </View>
                <AuraBadge label="Master Admin" tone="gold" />
              </View>

              {/* Subsection A: Generate Promo Code */}
              <View style={styles.adminSectionCard}>
                <View style={styles.adminSectionTitleRow}>
                  <Key size={14} color={Color.gold500} />
                  <AuraText role="bodyStrong" color={Color.gold300}>
                    توليد كود ترقية VIP جديد
                  </AuraText>
                </View>

                {/* Duration Pills */}
                <View style={styles.durationRow}>
                  {(["1m", "3m", "6m", "1y", "lifetime"] as SubscriptionDuration[]).map((dur) => (
                    <AuraTouch
                      key={dur}
                      feedback="selection"
                      onPress={() => setSelectedPromoDuration(dur)}
                      style={[
                        styles.durPill,
                        selectedPromoDuration === dur && styles.durPillActive,
                      ]}
                    >
                      <AuraText
                        role="tiny"
                        color={selectedPromoDuration === dur ? Color.ink0 : Color.text_secondary}
                        style={{ fontWeight: "700" }}
                      >
                        {DURATION_LABELS[dur]}
                      </AuraText>
                    </AuraTouch>
                  ))}
                </View>

                {/* Generate Button */}
                <AuraTouch
                  feedback="impact"
                  onPress={handleGenerateCode}
                  style={styles.actionBtn}
                >
                  <LinearGradient
                    colors={[Gradient.ember[0], Gradient.signature[1]]}
                    style={styles.actionBtnFace}
                  >
                    <Key size={15} color={Color.ink0} />
                    <AuraText role="bodyStrong" color={Color.ink0}>
                      توليد كود VIP ({DURATION_LABELS[selectedPromoDuration]})
                    </AuraText>
                  </LinearGradient>
                </AuraTouch>

                {/* Generated Code Result */}
                {lastGeneratedCode && (
                  <View style={styles.codeResultCard}>
                    <View style={{ flex: 1 }}>
                      <AuraText role="tiny" color={Color.text_muted}>
                        الكود المولّد:
                      </AuraText>
                      <AuraText role="title" color={Color.gold100} style={{ letterSpacing: 1.5, marginTop: 2 }}>
                        {lastGeneratedCode}
                      </AuraText>
                    </View>
                    <AuraTouch
                      feedback="selection"
                      onPress={() => setCopiedCode(true)}
                      style={styles.copyBtn}
                    >
                      {copiedCode ? (
                        <Check size={16} color={Color.state_success} />
                      ) : (
                        <Copy size={16} color={Color.gold500} />
                      )}
                      <AuraText role="tiny" color={copiedCode ? Color.state_success : Color.gold300}>
                        {copiedCode ? "تم النسخ" : "نسخ الكود"}
                      </AuraText>
                    </AuraTouch>
                  </View>
                )}

                {/* Generated Codes List */}
                {generatedList.length > 0 && (
                  <View style={styles.historyWrap}>
                    <AuraText role="tiny" color={Color.text_muted} style={{ marginBottom: 6 }}>
                      أحدث الأكواد المولّدة ({generatedList.length}):
                    </AuraText>
                    {generatedList.slice(0, 4).map((c) => (
                      <View key={c.code} style={styles.historyRow}>
                        <AuraText role="label" color={Color.gold300}>
                          {c.code}
                        </AuraText>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <AuraText role="tiny" color={Color.text_muted}>
                            {c.durationLabel}
                          </AuraText>
                          <AuraBadge
                            label={c.redeemed ? "مستخدم" : "متاح"}
                            tone={c.redeemed ? "quiet" : "live"}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Subsection B: Direct VIP Grant by Email */}
              <View style={[styles.adminSectionCard, { marginTop: Space.s3 }]}>
                <View style={styles.adminSectionTitleRow}>
                  <UserCheck size={14} color={Color.gold500} />
                  <AuraText role="bodyStrong" color={Color.gold300}>
                    منح اشتراك VIP مباشرة لأي حساب
                  </AuraText>
                </View>

                <TextInput
                  value={targetEmail}
                  onChangeText={setTargetEmail}
                  placeholder="أدخل البريد الإلكتروني للمستفيد (user@gmail.com)"
                  placeholderTextColor={Color.text_muted}
                  style={styles.adminInput}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                {/* Duration Pills */}
                <View style={styles.durationRow}>
                  {(["1m", "3m", "6m", "1y", "lifetime"] as SubscriptionDuration[]).map((dur) => (
                    <AuraTouch
                      key={dur}
                      feedback="selection"
                      onPress={() => setSelectedGrantDuration(dur)}
                      style={[
                        styles.durPill,
                        selectedGrantDuration === dur && styles.durPillActive,
                      ]}
                    >
                      <AuraText
                        role="tiny"
                        color={selectedGrantDuration === dur ? Color.ink0 : Color.text_secondary}
                        style={{ fontWeight: "700" }}
                      >
                        {DURATION_LABELS[dur]}
                      </AuraText>
                    </AuraTouch>
                  ))}
                </View>

                {/* Grant Button */}
                <AuraTouch
                  feedback="impact"
                  onPress={handleGrantSubscription}
                  style={styles.actionBtn}
                >
                  <LinearGradient
                    colors={[Gradient.ember[0], Gradient.signature[1]]}
                    style={styles.actionBtnFace}
                  >
                    <Send size={15} color={Color.ink0} />
                    <AuraText role="bodyStrong" color={Color.ink0}>
                      تفعيل VIP للمستخدم ({DURATION_LABELS[selectedGrantDuration]})
                    </AuraText>
                  </LinearGradient>
                </AuraTouch>

                {/* Grant Message Feedback */}
                {grantMessage && (
                  <View style={styles.grantFeedbackBox}>
                    <AuraText role="caption" color={Color.state_success} align="center">
                      {grantMessage}
                    </AuraText>
                  </View>
                )}

                {/* Granted Subscriptions List */}
                {grantedList.length > 0 && (
                  <View style={styles.historyWrap}>
                    <AuraText role="tiny" color={Color.text_muted} style={{ marginBottom: 6 }}>
                      الحسابات المفعّلة مؤخرًا ({grantedList.length}):
                    </AuraText>
                    {grantedList.slice(0, 4).map((sub) => (
                      <View key={sub.email} style={styles.historyRow}>
                        <AuraText role="label" color={Color.text_primary} lines={1} style={{ flex: 1 }}>
                          {sub.email}
                        </AuraText>
                        <AuraBadge label={sub.durationLabel} tone="gold" />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </LinearGradient>
          </View>
        )}

        {/* ── LEDGER ── */}
        <View style={styles.statsGrid}>
          <StatTile icon={<Music2 size={15} color={Color.gold500} />} value={downloadedSongs.length + favorites.length} label="أغانٍ محفوظة ومفضلة" />
          <StatTile icon={<Headphones size={15} color={Color.gold500} />} value={totalPlays} label="مرات الاستماع" />
          <StatTile icon={<Disc3 size={15} color={Color.gold500} />} value={uniqueArtists} label="فنانون مختلفون" />
          <StatTile icon={<Heart size={15} color={Color.gold500} />} value={favorites.length} label="في المفضلة" />
        </View>

        <AuraHairline intensity="gold" />

        {/* ── TASTE ── */}
        {topArtists.length > 0 && (
          <View style={styles.block}>
            <View style={styles.blockHead}>
              <AuraKicker>ذوقك الموسيقي</AuraKicker>
              <AuraText role="titleSm">الفنانون الأكثر استماعًا لديك</AuraText>
            </View>
            <View style={styles.tasteRow}>
              {topArtists.map(([name, plays], i) => (
                <AuraSurface key={name} tone="base" radius={Radius.md} padding={Space.s3} style={styles.tasteCard}>
                  <AuraText role="numeric" color={Color.gold700}>
                    {`0${i + 1}`}
                  </AuraText>
                  <AuraText role="label" lines={2} style={styles.tasteName}>
                    {name}
                  </AuraText>
                  <AuraText role="tiny" color={Color.text_muted}>
                    {plays} استماع
                  </AuraText>
                </AuraSurface>
              ))}
            </View>
          </View>
        )}

        {/* ── HISTORY ── */}
        <View style={styles.block}>
          <View style={styles.blockHead}>
            <AuraKicker>سجل الاستماع</AuraKicker>
            <AuraText role="titleSm">آخر ما استمعت إليه</AuraText>
          </View>

          {recentSongs.length === 0 ? (
            <AuraSurface tone="base" radius={Radius.lg} style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Headphones size={22} color={Color.gold700} />
              </View>
              <AuraText role="label" align="center">
                لا سجل استماع بعد
              </AuraText>
              <AuraText role="caption" color={Color.text_secondary} align="center" style={styles.emptyBody}>
                شغّل أي أغنية، وستظهر هنا مع إحصاءاتك المحسوبة تلقائيًا في الأعلى.
              </AuraText>
            </AuraSurface>
          ) : (
            <View style={styles.list}>
              {recentSongs.slice(0, 8).map((song, i) => {
                const isCurrent = currentSong?.id === song.id;
                return (
                  <AuraTouch
                    key={`hist-${song.id}-${i}`}
                    onPress={() => playSong(song, recentSongs, i)}
                    feedback="impact"
                    style={[styles.row, isCurrent && styles.rowCurrent]}
                  >
                    <AuraArtwork
                      uri={resolveArtworkUri(song.localArtworkPath, song.thumbnailUrl, song.youtubeVideoId, "song")}
                      placeholder={PLACEHOLDER_SONG}
                      size={42}
                      shape="tile"
                      ring={isCurrent ? "gold" : "hairline"}
                    >
                      {isCurrent && (
                        <View style={styles.rowOverlay}>
                          <AuraPlayPulse playing={isPlaying} size={11} />
                        </View>
                      )}
                    </AuraArtwork>
                    <View style={styles.rowInfo}>
                      <AuraText role="bodyStrong" lines={1} color={isCurrent ? Color.gold100 : Color.text_primary}>
                        {song.title}
                      </AuraText>
                      <View style={styles.rowMeta}>
                        <AuraText role="caption" color={Color.text_muted} lines={1} style={styles.rowArtist}>
                          {song.artist}
                        </AuraText>
                        {!!song.isDownloaded && <AuraBadge label="محفوظ" tone="quiet" />}
                      </View>
                    </View>
                    <View style={styles.rowPlay}>
                      <Play size={13} color={Color.gold300} fill={Color.gold300} />
                    </View>
                  </AuraTouch>
                );
              })}
            </View>
          )}
        </View>

        {/* ── LOCAL VAULT ── */}
        <AuraSurface tone="gold" radius={Radius.lg} style={styles.vaultCard}>
          <View style={styles.vaultIcon}>
            <HardDrive size={16} color={Color.gold300} />
          </View>
          <View style={{ flex: 1, flexShrink: 1 }}>
            <AuraText role="label">المكتبة المحلية</AuraText>
            <AuraText role="caption" color={Color.text_secondary}>
              {downloadedSongs.length} أغنية · {offlineMB.toFixed(1)} MB على الجهاز
            </AuraText>
          </View>
          <AuraChip label="فتح المكتبة" onPress={() => router.push("/(tabs)/library")} size="sm" />
        </AuraSurface>

        <View style={styles.footer}>
          <AuraHairline intensity="soft" />
          <AuraText role="tiny" color={Color.text_muted} align="center">
            Aura Music · الإصدار {Constants.expoConfig?.version ?? "1.0.0"}
          </AuraText>
        </View>
      </ScrollView>
    </AuraPageTransition>
  );
}

const StatTile: React.FC<{ icon: React.ReactNode; value: number; label: string }> = ({ icon, value, label }) => (
  <AuraSurface tone="base" radius={Radius.lg} padding={Space.s3} style={styles.tile}>
    <View style={styles.tileTop}>
      <View style={styles.tileIcon}>{icon}</View>
      <AuraText role="displaySm">{value}</AuraText>
    </View>
    <AuraText role="tiny" color={Color.text_muted} lines={2}>
      {label}
    </AuraText>
  </AuraSurface>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.ink0 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Space.s4,
    paddingTop: Space.s5,
    gap: Space.s4,
  },

  hero: { flexDirection: "row", alignItems: "center", gap: Space.s4 },
  avatarSlot: { position: "relative" },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRing: {
    position: "absolute",
    inset: -5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  heroCopy: { flex: 1, flexShrink: 1 },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    marginTop: Space.s1,
    flexWrap: "wrap",
  },

  authRow: {
    flexDirection: "row",
    gap: Space.s3,
    marginTop: Space.s2,
  },
  authBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    height: 42,
    borderRadius: Radius.md,
    paddingHorizontal: Space.s3,
  },
  vipAuthBtn: {
    backgroundColor: Color.veil_goldTint,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  loginAuthBtn: {
    backgroundColor: Color.gold500,
  },
  logoutBtn: {
    backgroundColor: "rgba(224, 96, 60, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(224, 96, 60, 0.3)",
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: Space.s3,
  },
  tile: { width: "48.5%", gap: Space.s2 },
  tileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_goldTintStrong,
  },

  block: { gap: Space.s3 },
  blockHead: { gap: 2 },

  tasteRow: { flexDirection: "row", flexWrap: "wrap", gap: Space.s2 },
  tasteCard: { width: "48.5%", gap: 3 },
  tasteName: { minHeight: 40 },

  list: { gap: Space.s2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    paddingVertical: Space.s2,
    paddingHorizontal: Space.s3,
    borderRadius: Radius.md,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairlineSoft,
  },
  rowCurrent: {
    borderColor: Color.veil_goldHairline,
    backgroundColor: Color.veil_goldTint,
  },
  rowInfo: { flex: 1, flexShrink: 1, gap: 3 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: Space.s2 },
  rowArtist: { flexShrink: 1, maxWidth: 200 },
  rowOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_inkGlow,
  },
  rowPlay: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Color.veil_hairlineStrong,
  },

  empty: { alignItems: "center", gap: Space.s2, paddingVertical: Space.s5 },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_goldTintStrong,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  emptyBody: { lineHeight: 20, maxWidth: 280 },

  vaultCard: { flexDirection: "row", alignItems: "center", gap: Space.s3 },
  vaultIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_goldTintStrong,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },

  footer: { gap: Space.s3, paddingTop: Space.s2 },

  masterSwitchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    paddingVertical: Space.s2,
    paddingHorizontal: Space.s3,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_goldTint,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    marginTop: Space.s2,
  },

  adminConsoleWrap: {
    borderRadius: Radius.xl,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: Color.gold500,
    marginTop: Space.s3,
    marginBottom: Space.s2,
  },
  adminConsoleHeader: {
    padding: Space.s4,
  },
  adminTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    marginBottom: Space.s4,
    borderBottomWidth: 1,
    borderBottomColor: Color.veil_goldHairline,
    paddingBottom: Space.s3,
  },
  adminCrownBadge: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_goldTintStrong,
    borderWidth: 1,
    borderColor: Color.gold500,
    alignItems: "center",
    justifyContent: "center",
  },
  adminSectionCard: {
    backgroundColor: Color.ink1,
    borderRadius: Radius.lg,
    padding: Space.s3,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
  },
  adminSectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    marginBottom: Space.s3,
  },
  durationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.s2,
    marginBottom: Space.s3,
  },
  durPill: {
    paddingHorizontal: Space.s3,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink2,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
  },
  durPillActive: {
    backgroundColor: Color.gold500,
    borderColor: Color.gold500,
  },
  actionBtn: {
    borderRadius: Radius.md,
    overflow: "hidden",
    marginTop: 4,
  },
  actionBtnFace: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    paddingVertical: 10,
    paddingHorizontal: Space.s3,
  },
  codeResultCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Color.veil_goldTint,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Color.gold500,
    padding: Space.s3,
    marginTop: Space.s3,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Color.ink0,
    paddingHorizontal: Space.s3,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  historyWrap: {
    marginTop: Space.s3,
    paddingTop: Space.s2,
    borderTopWidth: 1,
    borderTopColor: Color.veil_hairlineSoft,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  adminInput: {
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: Color.ink2,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    color: Color.text_primary,
    paddingHorizontal: Space.s3,
    fontSize: 13,
    marginBottom: Space.s3,
    textAlign: "right",
  },
  grantFeedbackBox: {
    marginTop: Space.s2,
    padding: Space.s2,
    borderRadius: Radius.sm,
    backgroundColor: "rgba(95, 207, 142, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(95, 207, 142, 0.3)",
  },
});
