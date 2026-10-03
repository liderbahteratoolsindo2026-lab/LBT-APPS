import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/ionicons";
import { useAuth, roleLabel } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";

export default function More() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin_utama";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.h1}>Lainnya</Text>
        <Text style={styles.subtitle}>{user?.name} · {roleLabel(user?.role)}{user?.marketing_name ? ` (${user.marketing_name})` : ""}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}>
        <Row icon="list" label="Tabel Gabungan Unit" onPress={() => router.push("/tabel-unit")} testID="go-table" />
        {isAdmin && (
          <>
            <Text style={styles.sectionTitle}>Admin Utama</Text>
            <Row icon="settings" label="Pengaturan Aplikasi" onPress={() => router.push("/pengaturan")} testID="go-pengaturan" />
            <Row icon="people" label="Kelola User" onPress={() => router.push("/users")} testID="go-users" />
            <Row icon="archive" label="Log Hapus Berkas" onPress={() => router.push("/log-hapus")} testID="go-log" />
          </>
        )}
        <View style={{ height: spacing.md }} />
        <Pressable testID="logout-row" style={[styles.row, { backgroundColor: "#FEE2E2" }]} onPress={logout}>
          <Icon name="log-out" size={20} color={colors.error} />
          <Text style={[styles.rowLabel, { color: colors.error }]}>Keluar</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, onPress, testID }: any) {
  return (
    <Pressable style={styles.row} onPress={onPress} testID={testID}>
      <Icon name={icon} size={20} color={colors.brandPrimary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  h1: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.md },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface },
});
