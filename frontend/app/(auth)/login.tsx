import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius, heroGradient } from "@/src/theme";

export default function Login() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

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
});
