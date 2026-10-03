import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { Badge, statusToKind } from "@/src/badge";

export default function TabelUnit() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data = [] } = useQuery({ queryKey: ["combined"], queryFn: () => api.combinedTable() });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return data;
    return data.filter((r: any) =>
      (r.blok_kavling || "").toLowerCase().includes(qq) ||
      (r.nama_konsumen || "").toLowerCase().includes(qq) ||
      (r.marketing || "").toLowerCase().includes(qq)
    );
  }, [data, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable onPress={() => router.back()} hitSlop={8}><Icon name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
          <Text style={styles.h1}>Tabel Unit Gabungan</Text>
        </View>
        <View style={styles.searchWrap}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Cari blok/konsumen/marketing"
            placeholderTextColor={colors.muted} style={styles.search} />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 60 }}>
        {filtered.map((r: any) => (
          <View key={r.blok_kavling} style={styles.card}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.blok}>Blok {r.blok_kavling}</Text>
              <Badge label={r.status_kpr || "-"} kind={statusToKind(r.status_kpr || "")} />
            </View>
            <Text style={styles.cons}>{r.nama_konsumen || "— tersedia —"}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: 4 }}>
              <Text style={styles.meta}>Marketing: <Text style={styles.metaBold}>{r.marketing || "-"}</Text></Text>
              <Text style={styles.meta}>Konstruksi: <Text style={styles.metaBold}>{r.tahap_konstruksi || "-"} ({r.persen_progres}%)</Text></Text>
              <Text style={styles.meta}>Sertifikat: <Text style={styles.metaBold}>{r.status_sertifikat}</Text></Text>
              <Text style={styles.meta}>IMB: <Text style={styles.metaBold}>{r.status_imb_pbg}</Text></Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  h1: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 42 },
  search: { flex: 1, color: colors.onSurface, fontSize: 14, outlineWidth: 0 as any },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 4 },
  blok: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  cons: { fontSize: 13, color: colors.onSurfaceSecondary },
  meta: { fontSize: 11, color: colors.muted },
  metaBold: { fontWeight: "700", color: colors.onSurface },
});
