import React, { useState } from "react";
import {
  Modal,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Crown, Sparkles, X, CheckCircle2, ShieldCheck, Zap, Radio, DownloadCloud, Bot } from "lucide-react-native";
import { Color, Gradient, Radius, Space } from "@/theme";
import { AuraBadge, AuraText, AuraTouch } from "@/ui";
import { useAuthStore, MASTER_ADMIN_EMAIL } from "@/store/useAuthStore";

export const PremiumModal: React.FC = () => {
  const visible = useAuthStore((s) => s.isPremiumModalVisible);
  const setVisible = useAuthStore((s) => s.setPremiumModalVisible);
  const isPremium = useAuthStore((s) => s.isPremium);
  const user = useAuthStore((s) => s.user);
  const activateMasterAccount = useAuthStore((s) => s.activateMasterAccount);
  const activatePromoCode = useAuthStore((s) => s.activatePromoCode);

  const [promoCode, setPromoCode] = useState("");
  const [feedback, setFeedback] = useState<{ success: boolean; text: string } | null>(null);

  if (!visible) return null;

  const handleApplyCode = async () => {
    if (!promoCode.trim()) return;
    const res = await activatePromoCode(promoCode);
    setFeedback({ success: res.success, text: res.message });
    if (res.success) {
      setPromoCode("");
    }
  };

  const handleMasterActivate = async () => {
    await activateMasterAccount();
    setFeedback({
      success: true,
      text: `🎉 تم تفعيل الحساب الرئيسي (${MASTER_ADMIN_EMAIL}) واشتراك VIP مدى الحياة!`,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => setVisible(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        />

        <View style={styles.card}>
          {/* Golden glow */}
          <LinearGradient
            colors={["rgba(226,177,60,0.35)", "rgba(226,177,60,0.05)", "transparent"]}
            locations={[0, 0.45, 1]}
            style={styles.cardGlow}
          />

          {/* Close button */}
          <AuraTouch
            feedback="selection"
            onPress={() => setVisible(false)}
            style={styles.closeBtn}
          >
            <X size={18} color={Color.text_muted} />
          </AuraTouch>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Crown Icon */}
            <View style={styles.crownCircle}>
              <LinearGradient
                colors={["#E2B13C", "#C08F24"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.crownFace}
              >
                <Crown size={32} color="#ffffff" />
              </LinearGradient>
            </View>

            <AuraText role="title" align="center" style={styles.title}>
              {isPremium ? "عضوية Aura VIP الذهبية" : "اكتشف قوة Aura Premium"}
            </AuraText>

            <AuraText role="caption" align="center" color={Color.text_muted} style={styles.subtitle}>
              {isPremium
                ? `مرحباً بك ${user?.displayName || "يا بطل"}! حسابك مفعل بكامل مميزات الـ VIP مدى الحياة.`
                : "ارتقِ بتجربتك الموسيقية إلى مستويات الاستوديو الاحترافية بدون حدود."}
            </AuraText>

            {isPremium && (
              <View style={styles.activeVipBox}>
                <ShieldCheck size={20} color={Color.gold500} />
                <AuraText role="label" color={Color.gold300} style={{ flex: 1 }}>
                  الاشتراك نشط مدى الحياة (VIP Lifetime Active 👑)
                </AuraText>
              </View>
            )}

            {/* Features List */}
            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <CheckCircle2 size={18} color={Color.gold500} style={styles.featureIcon} />
                <View style={styles.featureText}>
                  <AuraText role="label" color={Color.text_primary}>
                    جودة صوت استوديو فائقة (Studio Master HQ 32-bit)
                  </AuraText>
                  <AuraText role="tiny" color={Color.text_muted}>
                    نقاء صوت حقيقي وأدق تفاصيل الآلات الموسيقية
                  </AuraText>
                </View>
              </View>

              <View style={styles.featureItem}>
                <Zap size={18} color={Color.gold500} style={styles.featureIcon} />
                <View style={styles.featureText}>
                  <AuraText role="label" color={Color.text_primary}>
                    مضخم ومقوي الصوت الفائق (Super Boost 200%)
                  </AuraText>
                  <AuraText role="tiny" color={Color.text_muted}>
                    رفع مستوى الصوت لضعف القوة مع فلتر حماية السماعات
                  </AuraText>
                </View>
              </View>

              <View style={styles.featureItem}>
                <Radio size={18} color={Color.gold500} style={styles.featureIcon} />
                <View style={styles.featureText}>
                  <AuraText role="label" color={Color.text_primary}>
                    صوت فضائي محيطي 8D (360° Spatial Audio)
                  </AuraText>
                  <AuraText role="tiny" color={Color.text_muted}>
                    دوران الصوت المباشر بين فردتي السماعة كل 5.5 ثوانٍ
                  </AuraText>
                </View>
              </View>

              <View style={styles.featureItem}>
                <DownloadCloud size={18} color={Color.gold500} style={styles.featureIcon} />
                <View style={styles.featureText}>
                  <AuraText role="label" color={Color.text_primary}>
                    تحميل أوفلاين بلا حدود
                  </AuraText>
                  <AuraText role="tiny" color={Color.text_muted}>
                    استمع لكل أغانيك المفضلة أثناء السفر وبدون استهلاك باقة الإنترنت
                  </AuraText>
                </View>
              </View>

              <View style={styles.featureItem}>
                <Bot size={18} color={Color.gold500} style={styles.featureIcon} />
                <View style={styles.featureText}>
                  <AuraText role="label" color={Color.text_primary}>
                    الوصول الكامل إلى الذكاء الاصطناعي AI DJ
                  </AuraText>
                  <AuraText role="tiny" color={Color.text_muted}>
                    توليد مستمر لقوائم تناسب حالتك المزاجية ولحظتك الحالية
                  </AuraText>
                </View>
              </View>
            </View>

            {/* Quick Master Email Activation Button */}
            {!isPremium && (
              <AuraTouch
                feedback="impact"
                pressedScale={0.97}
                onPress={handleMasterActivate}
                style={styles.masterActivateBtn}
              >
                <LinearGradient
                  colors={["rgba(226,177,60,0.25)", "rgba(226,177,60,0.08)"]}
                  style={styles.masterBtnFace}
                >
                  <Crown size={20} color={Color.gold500} />
                  <View style={{ flex: 1 }}>
                    <AuraText role="label" color={Color.gold300}>
                      تفعيل فوري بالحساب الرئيسي 👑
                    </AuraText>
                    <AuraText role="tiny" color={Color.text_muted}>
                      {MASTER_ADMIN_EMAIL}
                    </AuraText>
                  </View>
                  <AuraBadge label="تفعيل فوري" tone="gold" />
                </LinearGradient>
              </AuraTouch>
            )}

            {/* Promo Code Box */}
            <View style={styles.promoWrap}>
              <AuraText role="kicker" style={{ marginBottom: Space.s2 }}>
                تفعيل بكود الـ VIP أو الاشتراك
              </AuraText>
              <View style={styles.promoRow}>
                <AuraTouch
                  feedback="selection"
                  onPress={handleApplyCode}
                  style={styles.applyBtn}
                >
                  <AuraText role="bodyStrong" color={Color.ink0}>
                    تطبيق
                  </AuraText>
                </AuraTouch>
                <TextInput
                  value={promoCode}
                  onChangeText={setPromoCode}
                  placeholder="مثال: AURA-VIP أو AURA-2026"
                  placeholderTextColor={Color.text_muted}
                  autoCapitalize="characters"
                  style={styles.promoInput}
                />
              </View>
            </View>

            {feedback && (
              <View style={[styles.feedbackBox, feedback.success ? styles.feedbackSuccess : styles.feedbackError]}>
                <AuraText role="caption" color={feedback.success ? Color.state_success : Color.state_danger} align="center">
                  {feedback.text}
                </AuraText>
              </View>
            )}

            <AuraTouch
              feedback="impact"
              pressedScale={0.97}
              onPress={() => setVisible(false)}
              style={styles.doneBtn}
            >
              <LinearGradient
                colors={[Gradient.ember[0], Gradient.signature[1]]}
                style={styles.doneFace}
              >
                <Sparkles size={18} color={Color.ink0} />
                <AuraText role="bodyStrong" color={Color.ink0}>
                  {isPremium ? "الاستمتاع بالموسيقى" : "حسناً، فهمت"}
                </AuraText>
              </LinearGradient>
            </AuraTouch>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "center",
    alignItems: "center",
    padding: Space.s4,
  },
  card: {
    width: "100%",
    maxWidth: 450,
    maxHeight: "88%",
    backgroundColor: Color.ink1,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    overflow: "hidden",
  },
  scrollContent: {
    padding: Space.s5,
  },
  cardGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  closeBtn: {
    position: "absolute",
    top: Space.s4,
    left: Space.s4,
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_hairline,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  crownCircle: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    marginBottom: Space.s3,
    overflow: "hidden",
    shadowColor: "#E2B13C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  crownFace: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginBottom: Space.s1,
  },
  subtitle: {
    marginBottom: Space.s4,
  },
  activeVipBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    backgroundColor: "rgba(226,177,60,0.14)",
    borderWidth: 1,
    borderColor: Color.gold500,
    borderRadius: Radius.md,
    padding: Space.s3,
    marginBottom: Space.s4,
  },
  featuresList: {
    gap: Space.s3,
    marginBottom: Space.s4,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Color.ink0,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    borderRadius: Radius.md,
    padding: Space.s3,
    gap: Space.s3,
  },
  featureIcon: {
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    alignItems: "flex-start",
  },
  masterActivateBtn: {
    borderRadius: Radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Color.gold500,
    marginBottom: Space.s4,
  },
  masterBtnFace: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    padding: Space.s3,
  },
  promoWrap: {
    marginBottom: Space.s4,
  },
  promoRow: {
    flexDirection: "row",
    gap: Space.s2,
  },
  promoInput: {
    flex: 1,
    backgroundColor: Color.ink0,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    borderRadius: Radius.md,
    paddingHorizontal: Space.s3,
    color: Color.text_primary,
    fontSize: 13,
    textAlign: "right",
    height: 44,
  },
  applyBtn: {
    backgroundColor: Color.gold500,
    borderRadius: Radius.md,
    paddingHorizontal: Space.s4,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackBox: {
    padding: Space.s3,
    borderRadius: Radius.md,
    marginBottom: Space.s4,
  },
  feedbackSuccess: {
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
  },
  feedbackError: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  doneBtn: {
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  doneFace: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
  },
});
