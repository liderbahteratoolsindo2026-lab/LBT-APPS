import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Badge, statusToKind } from "@/src/badge";

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.dashboard(),
  });
  const projectInfoQ = useQuery({
    queryKey: ["project_info"],
    queryFn: () => api.getConfig("project_info"),
  });

  const projectName = projectInfoQ.data?.value?.project_name || "Mahkota Graha";
  const companyName = projectInfoQ.data?.value?.company_name || "PT Lider Bahtera Toolsindo";

  const kpi = data?.kpi;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshing={isRefetching}
        onRefresh={refetch}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Image
            source="https://images.unsplash.com/photo-1556156653-e5a7c69cc263?w=1200&q=80"
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={["rgba(15,62,58,0.5)", "rgba(15,62,58,0.95)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroContent, { paddingTop: insets.top + spacing.lg }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.companyText}>{companyName}</Text>
                <Text style={styles.projectText}>{projectName}</Text>
                <View style={styles.roleChip}>
                  <Icon name="person-circle" size={14} color="#FFF" />
                  <Text style={styles.roleText}>{user?.name} · {roleLabel(user?.role)}</Text>
                </View>
              </View>
              <Pressable testID="logout-button" onPress={logout} style={styles.logoutBtn} hitSlop={8}>
                <Icon name="log-out-outline" size={20} color="#FFF" />
              </Pressable>
            </View>
          </View>
        </View>

        {isLoading ? (
          <View style={{ padding: spacing.xxl, alignItems: "center" }}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : (
          <View style={{ padding: spacing.lg, gap: spacing.lg }}>
            {/* KPI Grid */}
            <View style={styles.kpiGrid}>
              <KpiCard label="Total Berkas" value={kpi?.total ?? 0} icon="folder" color={colors.brandPrimary} />
              <KpiCard label="Proses" value={kpi?.proses ?? 0} icon="time" color="#D97706" />
              <KpiCard label="SP3K" value={kpi?.sp3k ?? 0} icon="checkmark-done" color="#0C4A6E" />
              <KpiCard label="Done (Akad)" value={kpi?.done ?? 0} icon="trophy" color={colors.success} />
              <KpiCard label="Diputihkan" value={kpi?.diputihkan ?? 0} icon="close-circle" color={colors.error} />
              <KpiCard label="Jatuh Tempo" value={kpi?.nearing_count ?? 0} icon="warning" color="#DC2626" />
            </View>

            {/* Indicators */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Indikator Utama</Text>
              <View style={styles.indicatorRow}>
                <IndItem label="% SP3K" value={`${kpi?.pct_sp3k ?? 0}%`} />
                <IndItem label="% Done" value={`${kpi?.pct_done ?? 0}%`} />
                <IndItem label="Rata² Progres" value={`${kpi?.avg_progress ?? 0}%`} />
              </View>
            </View>

            {/* Nearing deadline alert */}
            {data?.nearing?.length > 0 && (
              <View style={[styles.card, { borderColor: colors.error, borderWidth: 1, backgroundColor: "#FEF2F2" }]} testID="nearing-alert">
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Icon name="alert-circle" size={20} color={colors.error} />
                  <Text style={[styles.cardTitle, { color: colors.error, marginBottom: 0 }]}>Mendekati Batas Pemutihan</Text>
                </View>
                {data.nearing.slice(0, 5).map((r: any) => (
                  <View key={r.id} style={styles.nearingItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nearingName}>{r.nama_konsumen}</Text>
                      <Text style={styles.nearingSub}>{r.blok_kavling} · {r.marketing}</Text>
                    </View>
                    <Text style={styles.nearingDays}>
                      {r.days_to_pemutihan >= 0 ? `${r.days_to_pemutihan} hari` : "Lewat"}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Ringkasan Unit */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Ringkasan Unit Bangunan</Text>
              <View style={styles.unitGrid}>
                <UnitStat label="Total" value={data?.unit_summary?.total ?? 0} />
                <UnitStat label="Belum Mulai" value={data?.unit_summary?.belum_mulai ?? 0} tone="muted" />
                <UnitStat label="Proses" value={data?.unit_summary?.proses ?? 0} tone="warning" />
                <UnitStat label="Terlambat" value={data?.unit_summary?.terlambat ?? 0} tone="error" />
                <UnitStat label="Done" value={data?.unit_summary?.done ?? 0} tone="success" />
                <UnitStat label="Siap Dipasarkan" value={data?.unit_summary?.siap_dipasarkan ?? 0} tone="info" />
              </View>
            </View>

            {/* Per Marketing */}
            {data?.by_marketing?.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Rekap per Marketing</Text>
                {data.by_marketing.map((m: any) => (
                  <View key={m.marketing} style={styles.rekapRow}>
                    <Text style={styles.rekapName}>{m.marketing}</Text>
                    <View style={styles.rekapStats}>
                      <Text style={styles.rekapStat}>Total: <Text style={styles.rekapStatVal}>{m.total}</Text></Text>
                      <Text style={styles.rekapStat}>SP3K+Done: <Text style={styles.rekapStatVal}>{m.sp3k_done}</Text></Text>
                      <Text style={styles.rekapStat}>Putih: <Text style={[styles.rekapStatVal, { color: colors.error }]}>{m.diputihkan}</Text></Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Per Bank */}
            {data?.by_bank?.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Rekap per Bank</Text>
                {data.by_bank.map((b: any) => (
                  <View key={b.bank} style={styles.rekapRow}>
                    <Text style={styles.rekapName}>{b.bank}</Text>
                    <View style={styles.rekapStats}>
                      <Text style={styles.rekapStat}>Total: <Text style={styles.rekapStatVal}>{b.total}</Text></Text>
                      <Text style={styles.rekapStat}>Proses: <Text style={styles.rekapStatVal}>{b.proses}</Text></Text>
                      <Text style={styles.rekapStat}>SP3K+Done: <Text style={styles.rekapStatVal}>{b.sp3k_done}</Text></Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function roleLabel(role?: string) {
  switch (role) {
    case "admin_utama": return "Admin Utama";
    case "admin_kpr": return "Admin KPR";
    case "admin_legal": return "Admin Legal";
    case "admin_bangunan": return "Admin Bangunan";
    default: return "Admin";
  }
}

function KpiCard({ label, value, icon, color }: any) {
  return (
    <View style={styles.kpiCard} testID={`kpi-${label}`}>
      <View style={[styles.kpiIcon, { backgroundColor: color + "20" }]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function IndItem({ label, value }: any) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={styles.indValue}>{value}</Text>
      <Text style={styles.indLabel}>{label}</Text>
    </View>
  );
}

function UnitStat({ label, value, tone }: any) {
  const color = tone === "success" ? colors.success
    : tone === "warning" ? colors.warning
    : tone === "error" ? colors.error
    : tone === "info" ? "#0C4A6E"
    : tone === "muted" ? colors.muted
    : colors.onSurface;
  return (
    <View style={styles.unitStat}>
      <Text style={[styles.unitStatVal, { color }]}>{value}</Text>
      <Text style={styles.unitStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 220, position: "relative" },
  heroContent: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, justifyContent: "space-between" },
  companyText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "500" },
  projectText: { color: "#FFF", fontSize: 24, fontWeight: "800", marginTop: 2 },
  roleChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "flex-start",
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, marginTop: spacing.sm,
  },
  roleText: { color: "#FFF", fontSize: 11, fontWeight: "600" },
  logoutBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpiCard: {
    flexGrow: 1, flexBasis: "30%", minWidth: 100,
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.xs,
  },
  kpiIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  kpiLabel: { fontSize: 11, color: colors.muted, fontWeight: "500" },

  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm },

  indicatorRow: { flexDirection: "row", gap: spacing.md },
  indValue: { fontSize: 20, fontWeight: "800", color: colors.brandPrimary },
  indLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },

  nearingItem: { flexDirection: "row", paddingVertical: spacing.sm, alignItems: "center", borderTopWidth: 1, borderTopColor: colors.divider },
  nearingName: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  nearingSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  nearingDays: { fontSize: 13, fontWeight: "700", color: colors.error },

  unitGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  unitStat: {
    flexGrow: 1, flexBasis: "30%", minWidth: 90,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm,
    padding: spacing.md, alignItems: "center",
  },
  unitStatVal: { fontSize: 20, fontWeight: "800" },
  unitStatLabel: { fontSize: 10, color: colors.muted, marginTop: 2, textAlign: "center" },

  rekapRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  rekapName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  rekapStats: { flexDirection: "row", gap: spacing.md, marginTop: 4, flexWrap: "wrap" },
  rekapStat: { fontSize: 11, color: colors.muted },
  rekapStatVal: { fontWeight: "700", color: colors.onSurface },
});
