import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/ionicons";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius, heroGradient } from "@/src/theme";

WebBrowser.maybeCompleteAuthSession();

const AUTH_BASE = "https://auth.emergentagent.com/?redirect=";

function extractSessionId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function Login() {
  const { login, loginWithGoogle, loginWithApple } = useAuth();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [appleAvail, setAppleAvail] = useState(false);
  const processed = useRef<Set<string>>(new Set());

  const onSubmit = async () => {
    setErr(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (e: any) {
      setErr(e?.message || "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  const handleSession = useCallback(async (sid: string) => {
    if (!sid || processed.current.has(sid)) return;
    processed.current.add(sid);
    setLoading(true); setErr(null);
    try {
      await loginWithGoogle(sid);
    } catch (e: any) {
      setErr(e?.message || "Login Google gagal");
    } finally {
      setLoading(false);
    }
  }, [loginWithGoogle]);

  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const sid = extractSessionId((window.location.hash || "") + (window.location.search || ""));
      if (sid) {
        handleSession(sid).then(() => {
          try { window.history.replaceState(window.history.state, "", window.location.pathname); } catch {}
        });
      }
    }
    AppleAuthentication.isAvailableAsync().then(setAppleAvail).catch(() => setAppleAvail(false));
  }, [handleSession]);

  const googleLogin = async () => {
    setErr(null);
    try {
      if (Platform.OS === "web") {
        const redirect = window.location.origin + "/";
        window.location.href = AUTH_BASE + encodeURIComponent(redirect);
        return;
      }
      const redirect = Linking.createURL("");
      const res = await WebBrowser.openAuthSessionAsync(AUTH_BASE + encodeURIComponent(redirect), redirect);
      let url = (res as any)?.url || null;
      if (!url) url = await Linking.getInitialURL();
      const sid = extractSessionId(url);
      if (sid) await handleSession(sid);
    } catch (e: any) {
      setErr(e?.message || "Login Google gagal");
    }
  };

  const appleLogin = async () => {
    setErr(null);
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const name = cred.fullName
        ? [cred.fullName.givenName, cred.fullName.familyName].filter(Boolean).join(" ")
        : null;
      await loginWithApple({ identity_token: cred.identityToken || "", email: cred.email, name });
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") return;
      setErr(e?.message || "Login Apple gagal");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Image
              source="https://images.unsplash.com/photo-1556156653-e5a7c69cc263?w=1200&q=80"
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            <LinearGradient
              colors={heroGradient}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xl }]}>
              <View style={styles.logoCard} testID="login-logo">
                <Image source={require("../../assets/images/logo-lbt.png")} style={styles.logoImg} contentFit="contain" />
              </View>
              <Text style={styles.brand}>LBT One</Text>
              <Text style={styles.company}>Monitoring KPR · Bangunan · Legalitas</Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.title}>Masuk Akun</Text>
            <Text style={styles.sub}>Pantau KPR, bangunan, & legalitas dalam satu tempat.</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.inputWrap}>
                <Icon name="person" size={18} color={colors.muted} />
                <TextInput
                  testID="login-username-input"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="username"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <Icon name="lock-closed" size={18} color={colors.muted} />
                <TextInput
                  testID="login-password-input"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPwd}
                  autoCapitalize="none"
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
                <Pressable onPress={() => setShowPwd((v) => !v)} hitSlop={10}>
                  <Icon name={showPwd ? "eye-off" : "eye"} size={18} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            {err ? (
              <View style={styles.errorBox} testID="login-error">
                <Icon name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{err}</Text>
              </View>
            ) : null}

            <Pressable
              testID="login-submit-button"
              onPress={onSubmit}
              disabled={loading}
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }, loading && { opacity: 0.7 }]}
            >
              {loading ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.btnText}>Masuk</Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>atau masuk dengan</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable testID="google-login-button" onPress={googleLogin} disabled={loading}
              style={({ pressed }) => [styles.socialBtn, pressed && { opacity: 0.9 }]}>
              <Icon name="logo-google" size={18} color="#EA4335" />
              <Text style={styles.socialText}>Lanjut dengan Google</Text>
            </Pressable>

            {Platform.OS === "ios" && appleAvail && (
              <Pressable testID="apple-login-button" onPress={appleLogin} disabled={loading}
                style={({ pressed }) => [styles.socialBtn, { backgroundColor: "#000", borderColor: "#000" }, pressed && { opacity: 0.9 }]}>
                <Icon name="logo-apple" size={18} color="#FFFFFF" />
                <Text style={[styles.socialText, { color: "#FFFFFF" }]}>Lanjut dengan Apple</Text>
              </Pressable>
            )}

            <Text style={styles.socialHint}>
              Login Google/Apple hanya untuk email yang sudah didaftarkan Admin.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 300, backgroundColor: colors.brand, position: "relative" },
  heroContent: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: "flex-end", paddingBottom: spacing.xl, gap: spacing.sm },
  logoCard: {
    alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.xs,
  },
  logoImg: { width: 220, height: 56 },
  brand: { color: "#FFFFFF", fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  company: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "500" },
  formCard: {
    backgroundColor: colors.surface, marginTop: -24, marginHorizontal: spacing.lg,
    borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: -spacing.sm },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 48, borderWidth: 1, borderColor: colors.border,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 15, outlineWidth: 0 as any },
  errorBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: "#FEE2E2", padding: spacing.md, borderRadius: radius.sm },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
  btn: {
    backgroundColor: colors.brandPrimary, height: 50, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center", marginTop: spacing.xs,
  },
  btnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  socialBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  socialText: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  socialHint: { fontSize: 11, color: colors.muted, textAlign: "center" },
});
