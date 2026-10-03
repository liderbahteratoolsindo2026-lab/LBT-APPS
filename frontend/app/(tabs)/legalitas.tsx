import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useAuth, canEdit } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Field, SelectField } from "./kpr";
import { LegalDocs } from "@/src/components/legal-docs";

export default function Legalitas() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const editable = canEdit(user?.role, "legal");
  const qc = useQueryClient();
  const [tab, setTab] = useState<"unit" | "project">("unit");
  const [selected, setSelected] = useState<any>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [addingLegal, setAddingLegal] = useState(false);

  const unitsQ = useQuery({ queryKey: ["units"], queryFn: () => api.listUnits() });
  const legalityQ = useQuery({ queryKey: ["legality"], queryFn: () => api.listLegality() });
  const projectQ = useQuery({ queryKey: ["legality_project"], queryFn: () => api.getLegalityProject() });

  const legalityByBlok = new Map<string, any>((legalityQ.data || []).map((l: any) => [l.blok_kavling, l]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <Text style={styles.h1}>Legalitas</Text>
          <Text style={styles.subtitle}>{editable ? "Kelola status & dokumen legalitas" : "Lihat status & unduh dokumen legalitas"}</Text>
        </View>
        <View style={styles.tabs}>
          <Pressable testID="legal-tab-unit" onPress={() => setTab("unit")} style={[styles.tab, tab === "unit" && styles.tabActive]}>
            <Text style={[styles.tabText, tab === "unit" && styles.tabTextActive]}>Per Unit</Text>
          </Pressable>
          <Pressable testID="legal-tab-project" onPress={() => setTab("project")} style={[styles.tab, tab === "project" && styles.tabActive]}>
            <Text style={[styles.tabText, tab === "project" && styles.tabTextActive]}>Proyek</Text>
          </Pressable>
        </View>
      </View>

      {tab === "unit" ? (
        unitsQ.isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.brandPrimary} /> :
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}>
          {editable && (
            <Pressable testID="add-legality-button" onPress={() => setAddingLegal(true)} style={styles.addLegalBtn}>
              <Icon name="add-circle" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.addLegalText}>Tambah Legalitas</Text>
            </Pressable>
          )}
          {(unitsQ.data || []).map((u: any) => {
            const l = legalityByBlok.get(u.blok_kavling) || {};
            return (
              <Pressable key={u.blok_kavling} style={styles.card} testID={`legal-card-${u.blok_kavling}`}
                onPress={() => setSelected({ ...l, blok_kavling: u.blok_kavling })}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
                  <Text style={styles.cardTitle}>Blok {u.blok_kavling}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Icon name={editable ? "pencil" : "folder-open-outline"} size={14} color={colors.brandPrimary} />
                    <Text style={{ fontSize: 11, color: colors.brandPrimary, fontWeight: "600" }}>{editable ? "Ubah / Dokumen" : "Dokumen"}</Text>
                  </View>
                </View>
                <LegalRow label="Sertifikat" status={l.status_sertifikat} />
                <LegalRow label="IMB/PBG" status={l.status_imb_pbg} />
                <LegalRow label="PBB" status={l.status_pbb} />
                <LegalRow label="SSP/PPh" status={l.status_ssp_pph} />
                <LegalRow label="BPHTB" status={l.status_bphtb} />
              </Pressable>
            );
          })}
          {(() => {
            const unitBloks = new Set((unitsQ.data || []).map((u: any) => u.blok_kavling));
            const extra = (legalityQ.data || []).filter((l: any) => !unitBloks.has(l.blok_kavling));
            return extra.map((l: any) => (
              <Pressable key={`x-${l.blok_kavling}`} style={styles.card} testID={`legal-card-${l.blok_kavling}`}
                onPress={() => setSelected({ ...l })}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
                  <Text style={styles.cardTitle}>Blok {l.blok_kavling}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>tanpa data unit</Text>
                </View>
                <LegalRow label="Sertifikat" status={l.status_sertifikat} />
                <LegalRow label="IMB/PBG" status={l.status_imb_pbg} />
                <LegalRow label="PBB" status={l.status_pbb} />
                <LegalRow label="SSP/PPh" status={l.status_ssp_pph} />
                <LegalRow label="BPHTB" status={l.status_bphtb} />
              </Pressable>
            ));
          })()}
        </ScrollView>
      ) : (
        projectQ.isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.brandPrimary} /> :
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}>
          <View style={styles.card}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.cardTitle}>Legalitas Proyek</Text>
              {editable && (
                <Pressable testID="edit-project-legality" onPress={() => setEditingProject(true)} hitSlop={8}>
                  <Icon name="pencil" size={18} color={colors.brandPrimary} />
                </Pressable>
              )}
            </View>
            <ProjectRow label="Sertifikat Tanah Induk" value={projectQ.data?.sertifikat_tanah_induk} />
            <ProjectRow label="Nomor Sertifikat" value={projectQ.data?.nomor_sertifikat} />
            <ProjectRow label="IMB/PBG" value={projectQ.data?.imb_pbg} />
            <ProjectRow label="No IMB/PBG" value={projectQ.data?.nomor_imb_pbg} />
            <ProjectRow label="PKKPR" value={projectQ.data?.pkkpr} />
            <ProjectRow label="SLF" value={projectQ.data?.slf} />
            <ProjectRow label="Catatan Umum" value={projectQ.data?.catatan_umum} />
          </View>
          <View style={styles.card}>
            <LegalDocs scope="project" editable={editable} />
          </View>
        </ScrollView>
      )}

      <UnitLegalityModal
        data={selected}
        editable={editable}
        onClose={() => setSelected(null)}
        onSaved={() => { setSelected(null); qc.invalidateQueries({ queryKey: ["legality"] }); }}
      />
      <EditLegalityProject
        visible={editingProject}
        initial={projectQ.data}
        onClose={() => setEditingProject(false)}
        onSaved={() => { setEditingProject(false); qc.invalidateQueries({ queryKey: ["legality_project"] }); }}
      />
      <AddLegalityPicker
        visible={addingLegal}
        units={unitsQ.data || []}
        existing={legalityByBlok}
        onClose={() => setAddingLegal(false)}
        onPick={(blok: string) => { setAddingLegal(false); setSelected({ blok_kavling: blok }); }}
      />
    </View>
  );
}

function AddLegalityPicker({ visible, units, existing, onClose, onPick }: any) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"pilih" | "manual">("pilih");
  const [blok, setBlok] = useState("");
  const [manual, setManual] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (visible) { setMode("pilih"); setBlok(""); setManual(""); setErr(null); } }, [visible]);

  const lanjut = () => {
    const chosen = (mode === "pilih" ? blok : manual).trim();
    if (!chosen) { setErr("Pilih atau ketik blok/kavling dulu"); return; }
    onPick(chosen);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.lg }]} testID="add-legality-modal">
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md }}>
              <Text style={styles.modalTitle}>Tambah Legalitas</Text>
              <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
              <Pressable onPress={() => setMode("pilih")} style={[styles.modeChip, mode === "pilih" && styles.modeChipActive]}>
                <Text style={[styles.modeText, mode === "pilih" && { color: colors.onBrandPrimary }]}>Pilih dari Unit</Text>
              </Pressable>
              <Pressable onPress={() => setMode("manual")} style={[styles.modeChip, mode === "manual" && styles.modeChipActive]}>
                <Text style={[styles.modeText, mode === "manual" && { color: colors.onBrandPrimary }]}>Ketik Blok Baru</Text>
              </Pressable>
            </View>
            {mode === "pilih" ? (
              <SelectField label="Blok / Kavling (dari daftar unit)" value={blok}
                options={(units || []).map((u: any) => ({ label: `${u.blok_kavling}${existing?.get?.(u.blok_kavling) ? " (sudah ada)" : ""}`, value: u.blok_kavling }))}
                onChange={(v: any) => setBlok(v)} />
            ) : (
              <Field label="Blok / Kavling baru (mis. B20/9)" value={manual} onChange={(v: any) => setManual(v)} />
            )}
            {err && <Text style={{ color: colors.error, fontSize: 12, marginTop: 4 }}>{err}</Text>}
            <Pressable testID="legal-pick-next" onPress={lanjut} style={[styles.saveBtn, { marginTop: spacing.md }]}>
              <Text style={styles.saveBtnText}>Lanjut Isi Status</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function LegalRow({ label, status, info }: any) {
  const s = (status || "").toLowerCase();
  const color = s === "done" ? colors.success : s === "proses" ? colors.warning : colors.muted;
  return (
    <View style={styles.legalRow}>
      <Text style={styles.legalLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {info ? <Text style={styles.legalInfo}>{info}</Text> : null}
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <Text style={[styles.legalStatus, { color }]}>{status || "-"}</Text>
      </View>
    </View>
  );
}
function ProjectRow({ label, value }: any) {
  return (
    <View style={styles.legalRow}>
      <Text style={styles.legalLabel}>{label}</Text>
      <Text style={[styles.legalInfo, { flex: 1, textAlign: "right" }]} numberOfLines={2}>{value || "-"}</Text>
    </View>
  );
}

/** Detail legalitas per unit: form (admin legal) atau ringkasan read-only, plus dokumen. */
function UnitLegalityModal({ data, editable, onClose, onSaved }: any) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const statusQ = useQuery({ queryKey: ["list", "legality_status"], queryFn: () => api.getList("legality_status"), enabled: !!data && editable });

  useEffect(() => { if (data) { setForm(data); setErr(null); } }, [data]);
  const opts = (statusQ.data?.items || []).map((i: any) => ({ label: i.name, value: i.name }));

  const save = async () => {
    setSaving(true); setErr(null);
    try { await api.updateLegality(data.blok_kavling, form); onSaved(); }
    catch (e: any) { setErr(e?.message || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  if (!data) return null;
  return (
    <Modal visible={!!data} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.lg }]} testID="legal-unit-modal">
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md }}>
              <Text style={styles.modalTitle}>Legalitas Blok {data.blok_kavling}</Text>
              <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
              {editable ? (
                <>
                  <SelectField label="Status Sertifikat" value={form.status_sertifikat} options={opts} onChange={(v: any) => setForm({ ...form, status_sertifikat: v })} />
                  <Field label="Nomor Sertifikat" value={form.nomor_sertifikat} onChange={(v: any) => setForm({ ...form, nomor_sertifikat: v })} />
                  <SelectField label="Status IMB/PBG" value={form.status_imb_pbg} options={opts} onChange={(v: any) => setForm({ ...form, status_imb_pbg: v })} />
                  <Field label="Nomor IMB/PBG" value={form.nomor_imb_pbg} onChange={(v: any) => setForm({ ...form, nomor_imb_pbg: v })} />
                  <SelectField label="Status PBB" value={form.status_pbb} options={opts} onChange={(v: any) => setForm({ ...form, status_pbb: v })} />
                  <Field label="NOP" value={form.nop} onChange={(v: any) => setForm({ ...form, nop: v })} />
                  <SelectField label="Status SSP/PPh" value={form.status_ssp_pph} options={opts} onChange={(v: any) => setForm({ ...form, status_ssp_pph: v })} />
                  <SelectField label="Status BPHTB" value={form.status_bphtb} options={opts} onChange={(v: any) => setForm({ ...form, status_bphtb: v })} />
                  <Field label="Keterangan" value={form.keterangan} onChange={(v: any) => setForm({ ...form, keterangan: v })} multiline />
                </>
              ) : (
                <View style={{ marginBottom: spacing.sm }}>
                  <LegalRow label="Sertifikat" status={data.status_sertifikat} />
                  <LegalRow label="IMB/PBG" status={data.status_imb_pbg} />
                  <LegalRow label="PBB" status={data.status_pbb} />
                  <LegalRow label="SSP/PPh" status={data.status_ssp_pph} />
                  <LegalRow label="BPHTB" status={data.status_bphtb} />
                  {!!data.keterangan && <ProjectRow label="Keterangan" value={data.keterangan} />}
                </View>
              )}
              <LegalDocs scope="unit" blok={data.blok_kavling} editable={editable} />
            </ScrollView>
            {err && <Text style={{ color: colors.error, fontSize: 12, marginTop: spacing.sm }}>{err}</Text>}
            {editable && (
              <Pressable testID="save-legality-button" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
                {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveBtnText}>Simpan Status</Text>}
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function EditLegalityProject({ visible, initial, onClose, onSaved }: any) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (initial) setForm(initial); }, [initial, visible]);
  const save = async () => { setSaving(true); try { await api.putLegalityProject(form); onSaved(); } finally { setSaving(false); } };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md }}>
              <Text style={styles.modalTitle}>Legalitas Proyek</Text>
              <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
              <Field label="Sertifikat Tanah Induk" value={form.sertifikat_tanah_induk} onChange={(v: any) => setForm({ ...form, sertifikat_tanah_induk: v })} />
              <Field label="Nomor Sertifikat" value={form.nomor_sertifikat} onChange={(v: any) => setForm({ ...form, nomor_sertifikat: v })} />
              <Field label="IMB/PBG" value={form.imb_pbg} onChange={(v: any) => setForm({ ...form, imb_pbg: v })} />
              <Field label="No IMB/PBG" value={form.nomor_imb_pbg} onChange={(v: any) => setForm({ ...form, nomor_imb_pbg: v })} />
              <Field label="PKKPR" value={form.pkkpr} onChange={(v: any) => setForm({ ...form, pkkpr: v })} />
              <Field label="SLF" value={form.slf} onChange={(v: any) => setForm({ ...form, slf: v })} />
              <Field label="Catatan Umum" value={form.catatan_umum} onChange={(v: any) => setForm({ ...form, catatan_umum: v })} multiline />
            </ScrollView>
            <Pressable onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
              {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveBtnText}>Simpan</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  h1: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  tabs: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, padding: 4, borderRadius: radius.md },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4 },
  tabText: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  tabTextActive: { color: colors.brandPrimary },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  legalRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, gap: spacing.sm },
  legalLabel: { fontSize: 13, color: colors.muted, flex: 0.6 },
  legalInfo: { fontSize: 12, color: colors.onSurface },
  legalStatus: { fontSize: 12, fontWeight: "700" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "95%" },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  saveBtn: { backgroundColor: colors.brandPrimary, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  saveBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700" },
  addLegalBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, height: 46, borderRadius: radius.md },
  addLegalText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  modeChip: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  modeChipActive: { backgroundColor: colors.brandPrimary },
  modeText: { fontSize: 13, fontWeight: "700", color: colors.brandPrimary },
});
