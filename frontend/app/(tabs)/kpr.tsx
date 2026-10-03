import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useAuth, canEdit } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Badge, statusToKind } from "@/src/badge";

type Kpr = any;

export default function KprScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const editable = canEdit(user?.role, "kpr");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Kpr | null>(null);

  const { data = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["kpr"], queryFn: () => api.listKpr(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteKpr(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kpr"] }),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((r: Kpr) =>
      (r.nama_konsumen || "").toLowerCase().includes(q) ||
      (r.blok_kavling || "").toLowerCase().includes(q) ||
      (r.marketing || "").toLowerCase().includes(q)
    );
  }, [data, query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={styles.h1}>Berkas KPR</Text>
            <Text style={styles.subtitle}>{filtered.length} konsumen</Text>
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
      </View>

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
                  <Text style={styles.meta}>Blok {item.blok_kavling} · {item.bank_pemroses}</Text>
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
              </View>
              {editable && (
                <View style={styles.actions}>
                  <Pressable style={styles.actionBtn} onPress={() => { setEditing(item); setShowForm(true); }}>
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
                </View>
              )}
            </View>
          )}
        />
      )}

      <KprFormModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        editing={editing}
        onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["kpr"] }); }}
      />
    </View>
  );
}

function KprFormModal({ visible, onClose, editing, onSaved }: any) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<any>({
    nama_konsumen: "", blok_kavling: "", marketing: "", bank_pemroses: "",
    tanggal_booking: "", tahap_saat_ini: "", tanggal_sp3k: "", tanggal_akad: "", keterangan: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (editing) setForm({ ...editing, tanggal_sp3k: editing.tanggal_sp3k || "", tanggal_akad: editing.tanggal_akad || "" });
    else setForm({ nama_konsumen: "", blok_kavling: "", marketing: "", bank_pemroses: "",
      tanggal_booking: new Date().toISOString().slice(0, 10), tahap_saat_ini: "", tanggal_sp3k: "", tanggal_akad: "", keterangan: "" });
    setErr(null);
  }, [editing, visible]);

  const marketingQ = useQuery({ queryKey: ["list", "marketing"], queryFn: () => api.getList("marketing"), enabled: visible });
  const banksQ = useQuery({ queryKey: ["list", "banks"], queryFn: () => api.getList("banks"), enabled: visible });
  const stagesQ = useQuery({ queryKey: ["list", "kpr_stages"], queryFn: () => api.getList("kpr_stages"), enabled: visible });
  const availQ = useQuery({ queryKey: ["units_available"], queryFn: () => api.availableUnits(), enabled: visible && !editing });

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
              <SelectField label="Marketing" value={form.marketing}
                options={(marketingQ.data?.items || []).map((i: any) => ({ label: i.name, value: i.name }))}
                onChange={(v) => setForm({ ...form, marketing: v })} />
              <SelectField label="Bank Pemroses" value={form.bank_pemroses}
                options={(banksQ.data?.items || []).map((i: any) => ({ label: i.name, value: i.name }))}
                onChange={(v) => setForm({ ...form, bank_pemroses: v })} />
              <Field label="Tanggal Booking (YYYY-MM-DD)" value={form.tanggal_booking} onChange={(v) => setForm({ ...form, tanggal_booking: v })} />
              <SelectField label="Tahap Saat Ini" value={form.tahap_saat_ini}
                options={(stagesQ.data?.items || []).map((i: any) => ({ label: i.name, value: i.name }))}
                onChange={(v) => setForm({ ...form, tahap_saat_ini: v })} />
              <Field label="Tanggal SP3K (opsional)" value={form.tanggal_sp3k} onChange={(v) => setForm({ ...form, tanggal_sp3k: v })} />
              <Field label="Tanggal Akad (opsional)" value={form.tanggal_akad} onChange={(v) => setForm({ ...form, tanggal_akad: v })} />
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

export function Field({ label, value, onChange, multiline, testID }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value || ""}
        onChangeText={onChange}
        multiline={multiline}
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
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: 4 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.brandSecondary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill,
  },
  actionText: { fontSize: 12, fontWeight: "600", color: colors.brandPrimary },

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
  chip: { paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: 12, color: colors.onSurface, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  errorBox: { flexDirection: "row", gap: spacing.sm, backgroundColor: "#FEE2E2", padding: spacing.md, borderRadius: radius.sm, marginVertical: spacing.sm, alignItems: "center" },
  saveBtn: { backgroundColor: colors.brandPrimary, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  saveBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700" },
});
