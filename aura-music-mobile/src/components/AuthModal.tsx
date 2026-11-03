import React, { useState } from "react";
import {
  Modal,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { X, Crown, ShieldAlert, Sparkles, User, Mail, Lock, LogIn, UserPlus } from "lucide-react-native";
import { Color, Gradient, Radius, Space } from "@/theme";
import { AuraBadge, AuraText, AuraTouch } from "@/ui";
import { useAuthStore, MASTER_ADMIN_EMAIL } from "@/store/useAuthStore";

export const AuthModal: React.FC = () => {
  const visible = useAuthStore((s) => s.isAuthModalVisible);
  const setVisible = useAuthStore((s) => s.setAuthModalVisible);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const activateMasterAccount = useAuthStore((s) => s.activateMasterAccount);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!visible) return null;

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (mode === "login") {
      const res = await login(email, password);
      if (!res.success) setErrorMsg(res.message || "فشل تسجيل الدخول");
    } else {
      const res = await register(email, name, password);
      if (!res.success) setErrorMsg(res.message || "فشل إنشاء الحساب");
    }
  };

  const handleMasterLogin = async () => {
    await activateMasterAccount();
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
          {/* Header Glow */}
          <LinearGradient
            colors={["rgba(226,177,60,0.18)", "transparent"]}
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

          {/* Icon Badge */}
          <View style={styles.iconCircle}>
            <LinearGradient
              colors={[Gradient.ember[0], Gradient.signature[1]]}
              style={styles.iconFace}
            >
              <User size={24} color={Color.ink0} />
            </LinearGradient>
          </View>

          <AuraText role="title" align="center" style={styles.title}>
            {mode === "login" ? "تسجيل الدخول إلى Aura" : "إنشاء حساب جديد"}
          </AuraText>

          <AuraText role="caption" align="center" color={Color.text_muted} style={styles.subtitle}>
            {mode === "login"
              ? "استمتع بمزامنة قوائمك وتفعيل ميزات الـ VIP"
              : "انضم إلى مجتمع أورا للموسيقى العربية الفاخرة"}
          </AuraText>

          {/* Master Admin Quick Activation Button */}
          <AuraTouch
            feedback="impact"
            pressedScale={0.97}
            onPress={handleMasterLogin}
            style={styles.masterBtn}
          >
            <LinearGradient
              colors={["rgba(226,177,60,0.2)", "rgba(226,177,60,0.06)"]}
              style={styles.masterBtnFace}
            >
              <Crown size={18} color={Color.gold500} />
              <View style={{ flex: 1 }}>
                <AuraText role="label" color={Color.gold300}>
                  تفعيل الحساب الرئيسي (Master VIP)
                </AuraText>
                <AuraText role="tiny" color={Color.text_muted}>
                  {MASTER_ADMIN_EMAIL}
                </AuraText>
              </View>
              <AuraBadge label="VIP نشط" tone="gold" />
            </LinearGradient>
          </AuraTouch>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <AuraText role="tiny" color={Color.text_muted} style={{ paddingHorizontal: Space.s3 }}>
              أو عبر البريد الإلكتروني
            </AuraText>
            <View style={styles.dividerLine} />
          </View>

          {/* Mode Switcher */}
          <View style={styles.tabRow}>
            <AuraTouch
              feedback="selection"
              onPress={() => { setMode("login"); setErrorMsg(null); }}
              style={[styles.tabBtn, mode === "login" && styles.tabBtnActive]}
            >
              <AuraText role="label" color={mode === "login" ? Color.gold300 : Color.text_muted}>
                تسجيل الدخول
              </AuraText>
            </AuraTouch>
            <AuraTouch
              feedback="selection"
              onPress={() => { setMode("register"); setErrorMsg(null); }}
              style={[styles.tabBtn, mode === "register" && styles.tabBtnActive]}
            >
              <AuraText role="label" color={mode === "register" ? Color.gold300 : Color.text_muted}>
                حساب جديد
              </AuraText>
            </AuraTouch>
          </View>

          {/* Inputs */}
          <View style={styles.inputsGroup}>
            {mode === "register" && (
              <View style={styles.inputWrap}>
                <User size={16} color={Color.text_muted} style={styles.inputIcon} />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="الاسم المعروض"
                  placeholderTextColor={Color.text_muted}
                  style={styles.textInput}
                />
              </View>
            )}

            <View style={styles.inputWrap}>
              <Mail size={16} color={Color.text_muted} style={styles.inputIcon} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="البريد الإلكتروني"
                placeholderTextColor={Color.text_muted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.textInput}
              />
            </View>

            <View style={styles.inputWrap}>
              <Lock size={16} color={Color.text_muted} style={styles.inputIcon} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="كلمة المرور"
                placeholderTextColor={Color.text_muted}
                secureTextEntry
                style={styles.textInput}
              />
            </View>
          </View>

          {errorMsg && (
            <AuraText role="caption" color={Color.state_danger} align="center" style={{ marginTop: Space.s2 }}>
              {errorMsg}
            </AuraText>
          )}

          {/* Submit Button */}
          <AuraTouch
            feedback="impact"
            pressedScale={0.97}
            onPress={handleSubmit}
            style={styles.submitBtn}
          >
            <LinearGradient
              colors={[Gradient.ember[0], Gradient.signature[1]]}
              style={styles.submitFace}
            >
              {mode === "login" ? (
                <>
                  <LogIn size={18} color={Color.ink0} />
                  <AuraText role="bodyStrong" color={Color.ink0}>
                    دخول
                  </AuraText>
                </>
              ) : (
                <>
                  <UserPlus size={18} color={Color.ink0} />
                  <AuraText role="bodyStrong" color={Color.ink0}>
                    إنشاء حساب
                  </AuraText>
                </>
              )}
            </LinearGradient>
          </AuraTouch>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: Space.s4,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Color.ink1,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    padding: Space.s5,
    overflow: "hidden",
  },
  cardGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
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
  iconCircle: {
    alignSelf: "center",
    width: 54,
    height: 54,
    borderRadius: Radius.pill,
    marginBottom: Space.s3,
    overflow: "hidden",
  },
  iconFace: {
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
  masterBtn: {
    borderRadius: Radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Color.gold500,
    marginBottom: Space.s3,
  },
  masterBtnFace: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    padding: Space.s3,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Space.s3,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Color.veil_hairline,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: Color.ink0,
    borderRadius: Radius.md,
    padding: 3,
    marginBottom: Space.s4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Space.s2,
    alignItems: "center",
    borderRadius: Radius.sm,
  },
  tabBtnActive: {
    backgroundColor: Color.veil_goldTint,
  },
  inputsGroup: {
    gap: Space.s3,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Color.ink0,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    borderRadius: Radius.md,
    paddingHorizontal: Space.s3,
    height: 46,
  },
  inputIcon: {
    marginLeft: Space.s2,
  },
  textInput: {
    flex: 1,
    color: Color.text_primary,
    fontSize: 14,
    textAlign: "right",
  },
  submitBtn: {
    marginTop: Space.s4,
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  submitFace: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
  },
});
