import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { PasswordModal } from "@/src/components/password-modal";

const ROLES = [
  { value: "admin_utama", label: "Admin Utama" },
  { value: "admin_kpr", label: "Admin KPR" },
  { value: "admin_legal", label: "Admin Legal" },
  { value: "admin_bangunan", label: "Admin Bangunan" },
  { value: "marketing", label: "Marketing (Freelance)" },
];

export default function Users() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["users"], queryFn: () => api.listUsers() });
  const marketingQ = useQuery({ queryKey: ["list", "marketing"], queryFn: () => api.getList("marketing") });
  const [form, setForm] = useState({ username: "", password: "", name: "", role: "admin_kpr", marketing_name: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);

  const create = async () => {
    setErr(null); setSaving(true);
    try {
      await api.createUser({ ...form, marketing_name: form.role === "marketing" ? form.marketing_name : null });
      setForm({ username: "", password: "", name: "", role: "admin_kpr", marketing_name: "" });
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e: any) { setErr(e?.message || "Gagal"); }
    finally { setSaving(false); }
  };
  const del = async (u: string) => { await api.deleteUser(u); qc.invalidateQueries({ queryKey: ["users"] }); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable onPress={() => router.back()} hitSlop={8}><Icon name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
          <Text style={styles.h1}>Kelola User</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tambah User</Text>
          <TextInput placeholder="Username" placeholderTextColor={colors.muted} value={form.username} onChangeText={(v) => setForm({ ...form, username: v })} style={styles.input} />
          <TextInput placeholder="Nama Lengkap" placeholderTextColor={colors.muted} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} style={styles.input} />
          <TextInput placeholder="Password" placeholderTextColor={colors.muted} value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry style={styles.input} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}>
            {ROLES.map((r) => (
              <Pressable key={r.value} onPress={() => setForm({ ...form, role: r.value })}
                style={[styles.chip, { flexShrink: 0 }, form.role === r.value && styles.chipActive]}>
                <Text style={[styles.chipText, form.role === r.value && styles.chipTextActive]}>{r.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {form.role === "marketing" && (
            <View style={{ gap: 4 }}>
              <Text style={styles.hint}>Nama marketing (dari Pengaturan) — akun hanya bisa mengubah berkas atas nama ini</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}>
                {(marketingQ.data?.items || []).map((m: any) => (
                  <Pressable key={m.id} testID={`marketing-opt-${m.name}`} onPress={() => setForm({ ...form, marketing_name: m.name })}
                    style={[styles.chip, { flexShrink: 0 }, form.marketing_name === m.name && styles.chipActive]}>
                    <Text style={[styles.chipText, form.marketing_name === m.name && styles.chipTextActive]}>{m.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          {err && <Text style={{ color: colors.error, fontSize: 12 }}>{err}</Text>}
          <Pressable testID="create-user-btn" onPress={create} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Tambah User</Text>}
          </Pressable>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Daftar User ({data.length})</Text>
          {data.map((u: any) => (
            <View key={u.username} style={styles.userRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{u.name}</Text>
                <Text style={styles.userSub}>@{u.username} · {ROLES.find((r) => r.value === u.role)?.label}{u.marketing_name ? ` · ${u.marketing_name}` : ""}</Text>
              </View>
              {u.username !== "admin" && (
                <Pressable onPress={() => del(u.username)} hitSlop={8}>
                  <Icon name="trash" size={18} color={colors.error} />
                </Pressable>
              )}
              <Pressable testID={`reset-pwd-${u.username}`} onPress={() => setResetFor(u.username)} hitSlop={8} style={{ marginLeft: spacing.md }}>
                <Icon name="key" size={18} color={colors.brandPrimary} />
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
      <PasswordModal visible={!!resetFor} targetUsername={resetFor} onClose={() => setResetFor(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  h1: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, outlineWidth: 0 as any },
  chip: { paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: 12, color: colors.onSurface, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  saveBtn: { backgroundColor: colors.brandPrimary, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "700" },
  userRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  userName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  userSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  hint: { fontSize: 11, color: colors.muted },
});
