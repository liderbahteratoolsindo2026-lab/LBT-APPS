import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useAuth, canEdit, canEditKprItem } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Badge, statusToKind } from "@/src/badge";
import { formatDateTime } from "@/src/report-utils";

type Kpr = any;

export default function KprScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const editable = canEdit(user?.role, "kpr");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Kpr | null>(null);
  const [historyOf, setHistoryOf] = useState<Kpr | null>(null);
  const [putihOf, setPutihOf] = useState<Kpr | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const canPutihkan = user?.role === "admin_utama" || user?.role === "admin_kpr";

  const { data = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["kpr"], queryFn: () => api.listKpr(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteKpr(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kpr"] }),
  });
  const batalPutihMut = useMutation({
    mutationFn: (id: string) => api.batalPutihkanKpr(id),
    onMutate: () => setActionErr(null),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kpr"] }); qc.invalidateQueries({ queryKey: ["units_available"] }); },
    onError: (e: any) => setActionErr(e?.message || "Gagal membatalkan pemutihan"),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.filter((r: Kpr) => {
      if (statusFilter === "SEGERA") {
        if (!(r.status === "PROSES" && r.days_to_pemutihan !== null && r.days_to_pemutihan <= 3)) return false;
      } else if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      return (r.nama_konsumen || "").toLowerCase().includes(q) ||
        (r.blok_kavling || "").toLowerCase().includes(q) ||
        (r.marketing || "").toLowerCase().includes(q) ||
        (r.cabang_pemroses || "").toLowerCase().includes(q);
    });
  }, [data, query, statusFilter]);

  const segeraCount = useMemo(
    () => data.filter((r: Kpr) => r.status === "PROSES" && r.days_to_pemutihan !== null && r.days_to_pemutihan <= 3).length,
    [data]);

  const FILTERS: { key: string; label: string; tone?: string }[] = [
    { key: "", label: "Semua" },
    { key: "SEGERA", label: `Segera Diputihkan${segeraCount ? ` (${segeraCount})` : ""}`, tone: "error" },
    { key: "PROSES", label: "Proses" },
    { key: "SP3K", label: "SP3K" },
    { key: "DONE", label: "Done" },
    { key: "DIPUTIHKAN", label: "Diputihkan" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={styles.h1}>Berkas KPR</Text>
            <Text style={styles.subtitle}>
              {filtered.length} konsumen{user?.role === "marketing" ? ` · Marketing ${user.marketing_name}` : ""}
            </Text>
          </View>
          {editable && (
            <Pressable
              testID="add-kpr-button"
              onPress={() => { setEditing(null); setShowForm(true); }}
              style={styles.addBtn}
            >
              <Icon name="add" size={22} color={colors.onBrandPrimary} />
            </Pressable>
          )}
        </View>
        <View style={styles.searchWrap}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            testID="search-kpr-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Cari nama / blok / marketing"
            placeholderTextColor={colors.muted}
            style={styles.search}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {FILTERS.map((f) => {
            const active = statusFilter === f.key;
            const isErr = f.tone === "error";
            return (
              <Pressable key={f.key || "all"} testID={`filter-${f.key || "all"}`} onPress={() => setStatusFilter(f.key)}
                style={[styles.chip, { height: 32 }, active && (isErr ? styles.chipActiveErr : styles.chipActive)]}>
                {isErr && <Icon name="warning" size={12} color={active ? colors.onError : colors.error} />}
                <Text style={[styles.chipText, isErr && !active && { color: colors.error }, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {actionErr && (
        <View style={[styles.errorBox, { marginHorizontal: spacing.lg, marginTop: spacing.sm }]}>
          <Icon name="alert-circle" size={16} color={colors.error} />
          <Text style={{ color: colors.error, flex: 1, fontSize: 13 }}>{actionErr}</Text>
          <Pressable onPress={() => setActionErr(null)} hitSlop={8}><Icon name="close" size={16} color={colors.error} /></Pressable>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.brandPrimary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View style={{ padding: spacing.xxl, alignItems: "center" }}>
              <Icon name="document-outline" size={48} color={colors.muted} />
              <Text style={{ color: colors.muted, marginTop: spacing.md }}>Belum ada berkas KPR</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card} testID={`kpr-card-${item.blok_kavling}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.name}>{item.nama_konsumen}</Text>
                  <Text style={styles.meta}>Blok {item.blok_kavling} · {item.bank_pemroses}{item.cabang_pemroses ? ` ${item.cabang_pemroses}` : ""}</Text>
                  <Text style={styles.meta}>Marketing: {item.marketing}</Text>
                </View>
                <Badge label={item.status} kind={statusToKind(item.status)} />
              </View>
              <View style={styles.cardFoot}>
                <Text style={styles.footText}>Tahap: <Text style={styles.footBold}>{item.tahap_saat_ini}</Text></Text>
                <Text style={styles.footText}>Booking: <Text style={styles.footBold}>{item.tanggal_booking}</Text></Text>
                {item.status === "PROSES" && item.days_to_pemutihan !== null && (
                  <Text style={[styles.footText, { color: item.days_to_pemutihan <= 3 ? colors.error : colors.muted }]}>
                    Sisa: <Text style={styles.footBold}>{item.days_to_pemutihan} hari</Text>
                  </Text>
                )}
                {!!item.tanggal_sp3k && <Text style={styles.footText}>SP3K: <Text style={styles.footBold}>{item.tanggal_sp3k}</Text></Text>}
                {!!item.tanggal_akad && <Text style={styles.footText}>Akad: <Text style={styles.footBold}>{item.tanggal_akad}</Text></Text>}
              </View>
              {!!item.keterangan_tahap && (
                <View style={styles.noteRow} testID={`note-${item.blok_kavling}`}>
                  <Icon name="chatbubble-ellipses-outline" size={13} color={colors.onBrandSecondary} />
                  <Text style={styles.noteText}>{item.keterangan_tahap}</Text>
                </View>
              )}
              {item.status === "DIPUTIHKAN" && (
                <View style={styles.putihInfo} testID={`putih-info-${item.blok_kavling}`}>
                  <Icon name="refresh-circle" size={14} color={colors.error} />
                  <Text style={styles.putihText}>
                    {item.diputihkan_manual
                      ? `Diputihkan manual${item.alasan_pemutihan ? `: ${item.alasan_pemutihan}` : ""} · Blok ${item.blok_kavling} tersedia untuk konsumen baru`
                      : `Diputihkan otomatis (lewat batas waktu) · Blok ${item.blok_kavling} tersedia untuk konsumen baru`}
                  </Text>
                </View>
              )}
              <View style={styles.actions}>
                <Pressable style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary }]}
                  testID={`history-btn-${item.blok_kavling}`}
                  onPress={() => setHistoryOf(item)}>
                  <Icon name="time-outline" size={14} color={colors.onSurfaceSecondary} />
                  <Text style={[styles.actionText, { color: colors.onSurfaceSecondary }]}>Riwayat</Text>
                </Pressable>
                {canPutihkan && item.status === "PROSES" && (
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#FEF3C7" }]}
                    testID={`putihkan-btn-${item.blok_kavling}`}
                    onPress={() => setPutihOf(item)}>
                    <Icon name="refresh-circle-outline" size={14} color={colors.warning} />
                    <Text style={[styles.actionText, { color: colors.warning }]}>Putihkan</Text>
                  </Pressable>
                )}
                {canPutihkan && item.status === "DIPUTIHKAN" && item.diputihkan_manual && (
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#FEF3C7" }]}
                    testID={`batal-putih-btn-${item.blok_kavling}`}
                    disabled={batalPutihMut.isPending}
                    onPress={() => batalPutihMut.mutate(item.id)}>
                    <Icon name="arrow-undo-outline" size={14} color={colors.warning} />
                    <Text style={[styles.actionText, { color: colors.warning }]}>Batal Putih</Text>
                  </Pressable>
                )}
                {canEditKprItem(user, item) ? (
                  <>
                    <Pressable style={styles.actionBtn} testID={`edit-btn-${item.blok_kavling}`}
                      onPress={() => { setEditing(item); setShowForm(true); }}>
                      <Icon name="pencil" size={14} color={colors.brandPrimary} />
                      <Text style={styles.actionText}>Ubah</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: "#FEE2E2" }]}
                      onPress={() => deleteMut.mutate(item.id)}
                    >
                      <Icon name="trash" size={14} color={colors.error} />
                      <Text style={[styles.actionText, { color: colors.error }]}>Hapus</Text>
                    </Pressable>
                  </>
                ) : editable ? (
                  <View style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary }]}>
                    <Icon name="lock-closed-outline" size={12} color={colors.muted} />
                    <Text style={[styles.actionText, { color: colors.muted }]}>Hanya lihat</Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}
        />
      )}

      <KprFormModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        editing={editing}
        user={user}
        onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["kpr"] }); }}
      />
      <HistoryModal kpr={historyOf} onClose={() => setHistoryOf(null)} />
      <PutihkanModal
        kpr={putihOf}
        onClose={() => setPutihOf(null)}
        onDone={() => { setPutihOf(null); qc.invalidateQueries({ queryKey: ["kpr"] }); qc.invalidateQueries({ queryKey: ["units_available"] }); }}
      />
    </View>
  );
}

function PutihkanModal({ kpr, onClose, onDone }: any) {
  const insets = useSafeAreaInsets();
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  React.useEffect(() => { setAlasan(""); setErr(null); }, [kpr]);

  const submit = async () => {
    setBusy(true); setErr(null);
    try { await api.putihkanKpr(kpr.id, alasan.trim()); onDone(); }
    catch (e: any) { setErr(e?.message || "Gagal memutihkan"); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={!!kpr} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.lg }]} testID="putihkan-modal">
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={styles.modalTitle}>Putihkan Berkas</Text>
              <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <Text style={{ fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: spacing.md }}>
              Berkas <Text style={{ fontWeight: "700" }}>{kpr?.nama_konsumen}</Text> akan ditandai DIPUTIHKAN dan
              Blok <Text style={{ fontWeight: "700" }}>{kpr?.blok_kavling}</Text> dilepas sehingga bisa diproses
              konsumen baru beserta marketing pemrosesnya. Data berkas tetap tersimpan sebagai riwayat.
            </Text>
            <Field label="Alasan pemutihan" value={alasan} onChange={setAlasan} multiline testID="putihkan-alasan-input" />
            {err && (
              <View style={styles.errorBox}>
                <Icon name="alert-circle" size={16} color={colors.error} />
                <Text style={{ color: colors.error, flex: 1, fontSize: 13 }}>{err}</Text>
              </View>
            )}
            <Pressable testID="putihkan-confirm-button" onPress={submit} disabled={busy}
              style={[styles.saveBtn, { backgroundColor: colors.warning }, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color={colors.onWarning} /> : <Text style={styles.saveBtnText}>Putihkan & Lepas Unit</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function HistoryModal({ kpr, onClose }: any) {
  const insets = useSafeAreaInsets();
  const { data = [], isLoading } = useQuery({
    queryKey: ["kpr_history", kpr?.id],
    queryFn: () => api.kprHistory(kpr.id),
    enabled: !!kpr,
  });
  return (
    <Modal visible={!!kpr} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.lg }]} testID="history-modal">
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Riwayat Perubahan</Text>
                <Text style={styles.meta}>{kpr?.nama_konsumen} · Blok {kpr?.blok_kavling}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              {isLoading ? (
                <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.xl }} />
              ) : data.length === 0 ? (
                <Text style={{ color: colors.muted, textAlign: "center", marginVertical: spacing.xl }}>
                  Belum ada riwayat perubahan
                </Text>
              ) : (
                data.map((h: any, idx: number) => (
                  <View key={h.id} style={styles.histRow}>
                    <View style={styles.histLine}>
                      <View style={[styles.histDot, idx === 0 && { backgroundColor: colors.brandPrimary }]} />
                      {idx < data.length - 1 && <View style={styles.histBar} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: spacing.md }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                        <Text style={styles.histAksi}>
                          {h.aksi === "DIBUAT" ? "Berkas dibuat" : h.aksi === "DIUBAH" ? "Diubah"
                            : h.aksi === "DIPUTIHKAN" ? "Diputihkan (unit dilepas)"
                            : h.aksi === "PEMUTIHAN DIBATALKAN" ? "Pemutihan dibatalkan" : h.aksi}
                        </Text>
                        <Text style={styles.histTime}>{formatDateTime(h.waktu)}</Text>
                      </View>
                      <Text style={styles.histBy}>oleh {h.nama || h.oleh}</Text>
                      {!!h.catatan && <Text style={styles.histChange}>{h.aksi === "DIPUTIHKAN" ? "Alasan" : "Catatan"}: {h.catatan}</Text>}
                      {(h.perubahan || []).map((p: any, i: number) => (
                        <Text key={i} style={styles.histChange}>
                          <Text style={{ fontWeight: "700" }}>{p.field}: </Text>
                          {p.dari ? `${p.dari} → ` : ""}
                          <Text style={{ fontWeight: "700", color: colors.brandPrimary }}>{p.ke || "-"}</Text>
                        </Text>
                      ))}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function KprFormModal({ visible, onClose, editing, onSaved, user }: any) {
  const insets = useSafeAreaInsets();
  const isMarketing = user?.role === "marketing";
  const ownMarketing = isMarketing ? user?.marketing_name || "" : "";
  const [form, setForm] = useState<any>({
    nama_konsumen: "", blok_kavling: "", marketing: "", bank_pemroses: "", cabang_pemroses: "",
    tanggal_booking: "", tahap_saat_ini: "", tanggal_sp3k: "", tanggal_akad: "", keterangan: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (editing) setForm({ ...editing, cabang_pemroses: editing.cabang_pemroses || "", tanggal_sp3k: editing.tanggal_sp3k || "", tanggal_akad: editing.tanggal_akad || "", catatan_update: editing.keterangan_tahap || "" });
    else setForm({ nama_konsumen: "", blok_kavling: "", marketing: ownMarketing, bank_pemroses: "", cabang_pemroses: "",
      tanggal_booking: new Date().toISOString().slice(0, 10), tahap_saat_ini: "", tanggal_sp3k: "", tanggal_akad: "", keterangan: "", catatan_update: "" });
    setErr(null);
  }, [editing, visible, ownMarketing]);

  const marketingQ = useQuery({ queryKey: ["list", "marketing"], queryFn: () => api.getList("marketing"), enabled: visible && !isMarketing });
  const banksQ = useQuery({ queryKey: ["list", "banks"], queryFn: () => api.getList("banks"), enabled: visible });
  const branchesQ = useQuery({ queryKey: ["list", "branches"], queryFn: () => api.getList("branches"), enabled: visible });
  const stagesQ = useQuery({ queryKey: ["list", "kpr_stages"], queryFn: () => api.getList("kpr_stages"), enabled: visible });
  const availQ = useQuery({ queryKey: ["units_available"], queryFn: () => api.availableUnits(), enabled: visible && !editing });

  const isFinalStage = (name: string) => ["sp3k", "akad"].includes((name || "").trim().toLowerCase());
  const stageOptions = (stagesQ.data?.items || [])
    .filter((i: any) => !isMarketing || !isFinalStage(i.name))
    .map((i: any) => ({ label: i.name, value: i.name }));
  const stageIsSp3k = (form.tahap_saat_ini || "").trim().toLowerCase() === "sp3k";
  const stageIsAkad = (form.tahap_saat_ini || "").trim().toLowerCase() === "akad";

  const save = async () => {
    setErr(null); setSaving(true);
    try {
      const payload = {
        ...form,
        tanggal_sp3k: form.tanggal_sp3k || null,
        tanggal_akad: form.tanggal_akad || null,
      };
      if (editing) await api.updateKpr(editing.id, payload);
      else await api.createKpr(payload);
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <Text style={styles.modalTitle}>{editing ? "Ubah Berkas KPR" : "Tambah Berkas KPR"}</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Icon name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
              <Field label="Nama Konsumen" value={form.nama_konsumen} onChange={(v) => setForm({ ...form, nama_konsumen: v })} />
              {editing ? (
                <Field label="Blok Kavling" value={form.blok_kavling} onChange={(v) => setForm({ ...form, blok_kavling: v })} />
              ) : (
                <SelectField
                  label="Blok Kavling (unit siap)"
                  value={form.blok_kavling}
                  options={(availQ.data || []).map((u: any) => ({ label: `${u.blok_kavling} (${u.persen_progres}%)`, value: u.blok_kavling }))}
                  onChange={(v) => setForm({ ...form, blok_kavling: v })}
                />
              )}
              {isMarketing ? (
                <View style={{ marginBottom: spacing.md }}>
                  <Text style={styles.fieldLabel}>Marketing</Text>
                  <View style={[styles.fieldInput, { flexDirection: "row", alignItems: "center", gap: spacing.sm }]}>
                    <Icon name="lock-closed-outline" size={14} color={colors.muted} />
                    <Text style={{ color: colors.onSurface, fontSize: 14 }}>{ownMarketing}</Text>
                  </View>
                </View>
              ) : (
                <SelectField label="Marketing" value={form.marketing}
                  options={(marketingQ.data?.items || []).map((i: any) => ({ label: i.name, value: i.name }))}
                  onChange={(v) => setForm({ ...form, marketing: v })} />
              )}
              <SelectField label="Bank Pemroses" value={form.bank_pemroses}
                options={(banksQ.data?.items || []).map((i: any) => ({ label: i.name, value: i.name }))}
                onChange={(v) => setForm({ ...form, bank_pemroses: v })} />
              <SelectField label="Cabang Pemroses" value={form.cabang_pemroses}
                options={(branchesQ.data?.items || []).map((i: any) => ({ label: i.name, value: i.name }))}
                onChange={(v) => setForm({ ...form, cabang_pemroses: v })} />
              <Field label="Tanggal Booking (YYYY-MM-DD)" value={form.tanggal_booking} onChange={(v) => setForm({ ...form, tanggal_booking: v })} />
              <SelectField label="Tahap Saat Ini" value={form.tahap_saat_ini}
                options={stageOptions}
                onChange={(v) => setForm({ ...form, tahap_saat_ini: v })} />
              <Field label={`Catatan Proses${form.tahap_saat_ini ? ` ${form.tahap_saat_ini}` : ""} (opsional)`}
                value={form.catatan_update}
                onChange={(v) => setForm({ ...form, catatan_update: v })}
                placeholder="mis. menunggu konfirmasi dari bank"
                multiline testID="kpr-catatan-input" />
              {isMarketing ? (
                <View style={styles.infoBox}>
                  <Icon name="information-circle-outline" size={16} color={colors.onBrandSecondary} />
                  <Text style={styles.infoText}>Tahap SP3K & Akad serta tanggalnya hanya bisa diubah oleh Admin KPR.
                    {editing?.tanggal_sp3k ? ` SP3K: ${editing.tanggal_sp3k}.` : ""}{editing?.tanggal_akad ? ` Akad: ${editing.tanggal_akad}.` : ""}</Text>
                </View>
              ) : (
                <>
                  <Field label={`Tanggal SP3K${stageIsSp3k && !form.tanggal_sp3k ? " (otomatis hari ini)" : " (opsional)"}`}
                    value={form.tanggal_sp3k} onChange={(v) => setForm({ ...form, tanggal_sp3k: v })} />
                  <Field label={`Tanggal Akad${stageIsAkad && !form.tanggal_akad ? " (otomatis hari ini)" : " (opsional)"}`}
                    value={form.tanggal_akad} onChange={(v) => setForm({ ...form, tanggal_akad: v })} />
                </>
              )}
              <Field label="Keterangan" value={form.keterangan} onChange={(v) => setForm({ ...form, keterangan: v })} multiline />
            </ScrollView>
            {err && (
              <View style={styles.errorBox}>
                <Icon name="alert-circle" size={16} color={colors.error} />
                <Text style={{ color: colors.error, flex: 1, fontSize: 13 }}>{err}</Text>
              </View>
            )}
            <Pressable testID="save-kpr-button" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Simpan</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function Field({ label, value, onChange, multiline, testID, placeholder }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value || ""}
        onChangeText={onChange}
        multiline={multiline}
        placeholder={placeholder}
        style={[styles.fieldInput, multiline && { height: 70, textAlignVertical: "top" }]}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

export function SelectField({ label, value, options, onChange }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}>
        {options.map((o: any) => {
          const active = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)}
              style={[styles.chip, { flexShrink: 0 }, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md,
  },
  h1: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 42,
  },
  search: { flex: 1, color: colors.onSurface, fontSize: 14, outlineWidth: 0 as any },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  meta: { fontSize: 12, color: colors.muted },
  cardFoot: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  footText: { fontSize: 11, color: colors.muted },
  footBold: { fontWeight: "700", color: colors.onSurface },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: 4, flexWrap: "wrap" },
  putihInfo: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#FEF2F2", padding: spacing.sm, borderRadius: radius.sm },
  putihText: { flex: 1, fontSize: 11, color: colors.error, lineHeight: 15 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: colors.brandSecondary, padding: spacing.sm, borderRadius: radius.sm },
  noteText: { flex: 1, fontSize: 12, color: colors.onBrandSecondary, lineHeight: 16 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.brandSecondary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill,
  },
  actionText: { fontSize: 12, fontWeight: "600", color: colors.brandPrimary },

  histRow: { flexDirection: "row", gap: spacing.md },
  histLine: { width: 14, alignItems: "center" },
  histDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.borderStrong, marginTop: 4 },
  histBar: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  histAksi: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  histTime: { fontSize: 11, color: colors.muted },
  histBy: { fontSize: 11, color: colors.muted, marginBottom: 4 },
  histChange: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "92%" },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceSecondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 },
  fieldInput: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.onSurface, fontSize: 14,
    borderWidth: 1, borderColor: colors.border, outlineWidth: 0 as any,
  },
  chip: { flexDirection: "row", gap: 4, paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipActiveErr: { backgroundColor: colors.error, borderColor: colors.error },
  chipText: { fontSize: 12, color: colors.onSurface, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  infoBox: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.brandSecondary, padding: spacing.md, borderRadius: radius.sm, marginBottom: spacing.md, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 12, color: colors.onBrandSecondary, lineHeight: 17 },
  errorBox: { flexDirection: "row", gap: spacing.sm, backgroundColor: "#FEE2E2", padding: spacing.md, borderRadius: radius.sm, marginVertical: spacing.sm, alignItems: "center" },
  saveBtn: { backgroundColor: colors.brandPrimary, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  saveBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700" },
});
