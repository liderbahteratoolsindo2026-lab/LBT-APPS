import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

export default function LogHapus() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data = [] } = useQuery({ queryKey: ["deleted_log"], queryFn: () => api.deletedLog() });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable onPress={() => router.back()} hitSlop={8}><Icon name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
          <Text style={styles.h1}>Log Hapus Berkas</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {data.length === 0 && <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40 }}>Belum ada riwayat</Text>}
        {data.map((l: any, i: number) => (
          <View key={i} style={styles.card}>
            <Text style={styles.name}>{l.record?.nama_konsumen}</Text>
            <Text style={styles.sub}>Blok {l.record?.blok_kavling}</Text>
            <Text style={styles.meta}>Dihapus oleh: <Text style={styles.bold}>{l.deleted_by}</Text></Text>
            <Text style={styles.meta}>Waktu: <Text style={styles.bold}>{new Date(l.deleted_at).toLocaleString("id-ID")}</Text></Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  h1: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 2 },
  name: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted, marginBottom: 4 },
  meta: { fontSize: 11, color: colors.muted },
  bold: { fontWeight: "700", color: colors.onSurface },
});
