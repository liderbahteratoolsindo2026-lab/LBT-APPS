import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useAuth, roleLabel } from "@/src/auth-context";
import { useProject } from "@/src/project-context";
import { colors, spacing, radius, heroGradient } from "@/src/theme";
import { downloadReport, monthLabel, recentMonths } from "@/src/report-utils";

function reportScopeLabel(role?: string) {
  switch (role) {
    case "admin_utama": return "Laporan lengkap (KPR, Bangunan, Legalitas)";
    case "admin_bangunan": return "Laporan Progres Bangunan";
    case "admin_legal": return "Laporan Legalitas";
    default: return "Laporan Berkas KPR";
  }
}

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { projects, activeId, activeProject, setActive } = useProject();
  const [month, setMonth] = useState<string>("");
  const [marketing, setMarketing] = useState<string>("");
  const [exporting, setExporting] = useState<"" | "xlsx" | "pdf">("");
  const [exportErr, setExportErr] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard", activeId, month, marketing],
    queryFn: () => api.dashboard({ month: month || undefined, marketing: marketing || undefined }),
  });
  const isMarketing = user?.role === "marketing";
  const mktDashQ = useQuery({
    queryKey: ["mkt-dash", activeId, month],
    queryFn: () => api.marketingDashboard({ month: month || undefined }),
    enabled: isMarketing,
  });
  const projectInfoQ = useQuery({
    queryKey: ["project_info"],
    queryFn: () => api.getConfig("project_info"),
  });
  const marketingQ = useQuery({ queryKey: ["list", "marketing"], queryFn: () => api.getList("marketing") });
  const kprAllQ = useQuery({ queryKey: ["kpr", activeId], queryFn: () => api.listKpr() });
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    (kprAllQ.data || []).forEach((r: any) => {
      ["tanggal_booking", "tanggal_sp3k", "tanggal_akad", "tanggal_pemutihan"].forEach((f) => {
        const v = r[f];
        if (typeof v === "string" && v.length >= 7) set.add(v.slice(0, 7));
      });
    });
    const arr = Array.from(set).sort().reverse();
    return arr.length ? arr : recentMonths(6);
  }, [kprAllQ.data]);

  const projectName = activeProject?.name || projectInfoQ.data?.value?.project_name || "Mahkota Graha I";
  const companyName = activeProject?.company_name || projectInfoQ.data?.value?.company_name || "PT Lider Bahtera Toolsindo";
  const mkt = mktDashQ.data;
  const qc = useQueryClient();
  const canPutih = user?.role === "admin_utama" || user?.role === "admin_kpr";
  const [detail, setDetail] = useState<{ title: string; key: string } | null>(null);
  const [actBusy, setActBusy] = useState<string | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);

  const rows: any[] = data?.kpr_rows || [];
  const detailItems = (key: string): any[] => {
    switch (key) {
      case "total_berjalan": return rows.filter((r) => r.status !== "DONE");
      case "proses": return rows.filter((r) => r.status === "PROSES");
      case "sp3k": return rows.filter((r) => r.status === "SP3K");
      case "done": return rows.filter((r) => r.status === "DONE");
      case "diputihkan": return rows.filter((r) => r.status === "DIPUTIHKAN");
      case "pemberkasan": return rows.filter((r) => (r.tahap_saat_ini || "").toLowerCase() === "pemberkasan" && r.status !== "DONE" && r.status !== "DIPUTIHKAN");
      case "nearing": return rows.filter((r) => r.status === "PROSES" && r.days_to_pemutihan !== null && r.days_to_pemutihan <= 3);
      case "macet": return rows.filter((r) => r.perlu_tindak_lanjut);
      default: return rows;
    }
  };

  const doPutih = async (id: string, batal: boolean) => {
    setActBusy(id); setActErr(null);
    try {
      if (batal) await api.batalPutihkanKpr(id);
      else await api.putihkanKpr(id, "Diputihkan dari Dashboard");
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      await qc.invalidateQueries({ queryKey: ["kpr"] });
      await refetch();
    } catch (e: any) {
      setActErr(e?.message || "Gagal");
    } finally { setActBusy(null); }
  };

  const kpi = data?.kpi;

  const doExport = async (format: "xlsx" | "pdf") => {
    setExporting(format); setExportErr(null);
    try {
      await downloadReport({ month: month || undefined, marketing: marketing || undefined, format });
    } catch (e: any) {
      setExportErr(e?.message || "Gagal mengunduh laporan");
    } finally {
      setExporting("");
    }
  };

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
            colors={heroGradient}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroContent, { paddingTop: insets.top + spacing.lg }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={styles.emblemBox} testID="dashboard-emblem">
                <Image source={require("../../assets/images/emblem.png")} style={{ width: 44, height: 44 }} contentFit="contain" />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.appName}>LBT One</Text>
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

        {/* Filter & Export */}
        <View style={styles.filterCard}>
          {projects.length > 0 && (
            <>
              <Text style={styles.filterTitle}>Proyek</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {projects.map((p: any) => (
                  <Chip key={p.id} label={p.name} active={activeId === p.id} onPress={() => setActive(p.id)} testID={`project-${p.id}`} />
                ))}
              </ScrollView>
            </>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.filterTitle}>Filter Rekap</Text>
            {(month || marketing) ? (
              <Pressable testID="reset-filter" onPress={() => { setMonth(""); setMarketing(""); }} hitSlop={8}>
                <Text style={{ fontSize: 12, color: colors.brandPrimary, fontWeight: "600" }}>Reset</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            <Chip label="Semua Bulan" active={!month} onPress={() => setMonth("")} testID="month-all" />
            {monthOptions.map((m) => (
              <Chip key={m} label={monthLabel(m)} active={month === m} onPress={() => setMonth(m)} testID={`month-${m}`} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            <Chip label="Semua Marketing" active={!marketing} onPress={() => setMarketing("")} testID="marketing-all" />
            {(marketingQ.data?.items || []).map((m: any) => (
              <Chip key={m.id} label={m.name} active={marketing === m.name} onPress={() => setMarketing(m.name)} testID={`marketing-${m.name}`} />
            ))}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
            <Pressable testID="export-xlsx" onPress={() => doExport("xlsx")} disabled={!!exporting} style={styles.exportBtn}>
              {exporting === "xlsx" ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Icon name="grid-outline" size={15} color={colors.onBrandPrimary} />}
              <Text style={styles.exportText}>Excel</Text>
            </Pressable>
            <Pressable testID="export-pdf" onPress={() => doExport("pdf")} disabled={!!exporting} style={[styles.exportBtn, { backgroundColor: colors.error }]}>
              {exporting === "pdf" ? <ActivityIndicator size="small" color={colors.onError} /> : <Icon name="document-text-outline" size={15} color={colors.onError} />}
              <Text style={styles.exportText}>PDF</Text>
            </Pressable>
            <Text style={{ fontSize: 11, color: colors.muted, flex: 1 }} numberOfLines={2}>
              {reportScopeLabel(user?.role)} · {month ? monthLabel(month) : "semua periode"}
              {user?.role === "marketing" ? ` · ${user.marketing_name}` : marketing ? ` · ${marketing}` : ""}
            </Text>
          </View>
          {exportErr && <Text style={{ color: colors.error, fontSize: 12 }}>{exportErr}</Text>}
        </View>

        {isLoading ? (
          <View style={{ padding: spacing.xxl, alignItems: "center" }}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : (
          <View style={{ padding: spacing.lg, gap: spacing.lg }}>
            {isMarketing && mkt && (
              <View style={[styles.card, { backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary }]} testID="marketing-summary">
                <Text style={[styles.cardTitle, { color: colors.onBrandSecondary }]}>
                  Ringkasan Saya · {mkt.marketing || user?.marketing_name || "-"}
                </Text>
                <View style={styles.unitGrid}>
                  <UnitStat label="Total Berkas" value={mkt.total} tone="info" />
                  <UnitStat label="Segera Diputihkan" value={mkt.segera_diputihkan} tone="error" />
                  <UnitStat label="Perlu T. Lanjut" value={mkt.macet} tone="warning" />
                  <UnitStat label="SP3K" value={mkt.sp3k} tone="info" />
                  <UnitStat label="Done (Akad)" value={mkt.done} tone="success" />
                  <UnitStat label="Masuk Bln Ini" value={mkt.bulan_ini} />
                </View>
                <View style={{ marginTop: spacing.sm }}>
                  <Text style={styles.targetLabel}>
                    Target bulan ini: {mkt.target > 0 ? `${mkt.bulan_ini} / ${mkt.target}` : "belum diatur Admin"}
                  </Text>
                  {mkt.target > 0 && (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.min(100, Math.round((mkt.bulan_ini / mkt.target) * 100))}%` }]} />
                    </View>
                  )}
                </View>
              </View>
            )}
            {/* KPI Grid */}
            <View style={styles.kpiGrid}>
              <KpiCard label="Total Berjalan" value={kpi?.total_berjalan ?? 0} icon="folder" color={colors.brandPrimary} onPress={() => setDetail({ title: "Berkas Berjalan (belum akad)", key: "total_berjalan" })} />
              <KpiCard label="Pemberkasan" value={kpi?.pemberkasan ?? 0} icon="documents" color={colors.info} onPress={() => setDetail({ title: "Baru Booking / Pemberkasan", key: "pemberkasan" })} />
              <KpiCard label="Proses" value={kpi?.proses ?? 0} icon="time" color={colors.warning} onPress={() => setDetail({ title: "Berkas Proses", key: "proses" })} />
              <KpiCard label="SP3K" value={kpi?.sp3k ?? 0} icon="checkmark-done" color={colors.info} onPress={() => setDetail({ title: "Berkas SP3K (belum akad)", key: "sp3k" })} />
              <KpiCard label="Done (Akad)" value={kpi?.done ?? 0} icon="trophy" color={colors.success} onPress={() => setDetail({ title: "Berkas Done (Akad)", key: "done" })} />
              <KpiCard label="Diputihkan" value={kpi?.diputihkan ?? 0} icon="close-circle" color={colors.error} onPress={() => setDetail({ title: "Berkas Diputihkan", key: "diputihkan" })} />
              <KpiCard label="Jatuh Tempo" value={kpi?.nearing_count ?? 0} icon="warning" color={colors.error} onPress={() => setDetail({ title: "Mendekati Jatuh Tempo", key: "nearing" })} />
              <KpiCard label="Perlu Tindak Lanjut" value={kpi?.macet_count ?? 0} icon="alert-circle" color={colors.warning} onPress={() => setDetail({ title: "Perlu Tindak Lanjut", key: "macet" })} />
            </View>

            {/* Indicators */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Indikator Utama</Text>
              <View style={styles.indicatorRow}>
                <IndItem label="% SP3K" value={`${kpi?.pct_sp3k ?? 0}%`} />
                <IndItem label="% Done (Akad)" value={`${kpi?.pct_done ?? 0}%`} />
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

            {/* Perlu Tindak Lanjut (macet > 7 hari) */}
            {data?.macet?.length > 0 && (
              <View style={[styles.card, { borderColor: colors.warning, borderWidth: 1, backgroundColor: "#FFFBEB" }]} testID="macet-alert">
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Icon name="alert-circle" size={20} color={colors.warning} />
                  <Text style={[styles.cardTitle, { color: colors.warning, marginBottom: 0 }]}>Perlu Tindak Lanjut (tanpa update &gt; 7 hari)</Text>
                </View>
                {data.macet.slice(0, 8).map((r: any) => (
                  <View key={r.id} style={styles.nearingItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nearingName}>{r.nama_konsumen}</Text>
                      <Text style={styles.nearingSub}>{r.blok_kavling} · {r.marketing} · {r.tahap_saat_ini}</Text>
                    </View>
                    <Text style={[styles.nearingDays, { color: colors.warning }]}>{r.status}</Text>
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
                <Text style={styles.rekapLegend}>Berjalan (booking/pemberkasan/proses) · SP3K belum akad · Akad (done) · Diputihkan</Text>
                {data.by_marketing.map((m: any) => (
                  <View key={m.marketing} style={styles.rekapRow}>
                    <Text style={styles.rekapName}>{m.marketing}</Text>
                    <View style={styles.rekapStats}>
                      <Text style={styles.rekapStat}>Berjalan: <Text style={styles.rekapStatVal}>{m.proses}</Text></Text>
                      <Text style={styles.rekapStat}>SP3K: <Text style={styles.rekapStatVal}>{m.sp3k}</Text></Text>
                      <Text style={styles.rekapStat}>Akad: <Text style={[styles.rekapStatVal, { color: colors.success }]}>{m.done}</Text></Text>
                      <Text style={styles.rekapStat}>Diputihkan: <Text style={[styles.rekapStatVal, { color: colors.error }]}>{m.diputihkan}</Text></Text>
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

      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{detail?.title} ({detail ? detailItems(detail.key).length : 0})</Text>
              <Pressable testID="detail-close" onPress={() => setDetail(null)} hitSlop={8}>
                <Icon name="close" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            {actErr && <Text style={{ color: colors.error, fontSize: 12, paddingHorizontal: spacing.lg }}>{actErr}</Text>}
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
              {detail && detailItems(detail.key).length === 0 && (
                <Text style={{ color: colors.muted, textAlign: "center", padding: spacing.lg }}>Tidak ada data</Text>
              )}
              {detail && detailItems(detail.key).map((r) => (
                <View key={r.id} style={styles.detailItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailName}>{r.nama_konsumen}</Text>
                    <Text style={styles.detailSub}>Blok {r.blok_kavling} · {r.marketing} · {r.tahap_saat_ini}</Text>
                    <Text style={styles.detailSub}>
                      Status: {r.status}
                      {r.status === "PROSES" && r.days_to_pemutihan !== null ? ` · sisa ${r.days_to_pemutihan} hari` : ""}
                      {r.tanggal_sp3k ? ` · SP3K ${r.tanggal_sp3k}` : ""}
                      {r.tanggal_akad ? ` · Akad ${r.tanggal_akad}` : ""}
                    </Text>
                  </View>
                  {canPutih && (r.status === "PROSES") && !r.has_sp3k && (
                    <Pressable testID={`putih-${r.id}`} onPress={() => doPutih(r.id, false)} disabled={actBusy === r.id}
                      style={[styles.detailBtn, { backgroundColor: colors.error }]}>
                      {actBusy === r.id ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.detailBtnText}>Putihkan</Text>}
                    </Pressable>
                  )}
                  {canPutih && r.status === "DIPUTIHKAN" && r.diputihkan_manual && (
                    <Pressable testID={`batal-${r.id}`} onPress={() => doPutih(r.id, true)} disabled={actBusy === r.id}
                      style={[styles.detailBtn, { backgroundColor: colors.success }]}>
                      {actBusy === r.id ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.detailBtnText}>Aktifkan lagi</Text>}
                    </Pressable>
                  )}
                </View>
              ))}
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Chip({ label, active, onPress, testID }: any) {
  return (
    <Pressable onPress={onPress} testID={testID} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function KpiCard({ label, value, icon, color, onPress }: any) {
  return (
    <Pressable style={styles.kpiCard} testID={`kpi-${label}`} onPress={onPress}>
      <View style={[styles.kpiIcon, { backgroundColor: color + "20" }]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {onPress ? <Icon name="chevron-forward" size={13} color={colors.muted} style={{ position: "absolute", top: 10, right: 10 }} /> : null}
    </Pressable>
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
    : tone === "info" ? colors.info
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
  hero: { height: 240, position: "relative" },
  emblemBox: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  appName: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
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

  filterCard: {
    marginHorizontal: spacing.lg, marginTop: -spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  filterTitle: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  chip: { paddingHorizontal: spacing.md, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: 12, color: colors.onSurface, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  exportBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.success, paddingHorizontal: spacing.md, height: 36, borderRadius: radius.md },
  exportText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "700" },

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
  targetLabel: { fontSize: 12, fontWeight: "600", color: colors.onBrandSecondary },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, marginTop: 6, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
  rekapLegend: { fontSize: 10, color: colors.muted, marginTop: -spacing.sm, marginBottom: 2 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "82%" },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  modalTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, flex: 1 },
  detailItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  detailName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  detailSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  detailBtn: { paddingHorizontal: spacing.md, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  detailBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
});
