import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useAuth, canEdit } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Field, SelectField } from "./(tabs)/kpr";

export default function Legalitas() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const editable = canEdit(user?.role, "legal");
  const qc = useQueryClient();
  const [tab, setTab] = useState<"unit" | "project">("unit");
  const [editing, setEditing] = useState<any>(null);
  const [editingProject, setEditingProject] = useState(false);

  const unitsQ = useQuery({ queryKey: ["units"], queryFn: () => api.listUnits() });
  const legalityQ = useQuery({ queryKey: ["legality"], queryFn: () => api.listLegality() });
  const projectQ = useQuery({ queryKey: ["legality_project"], queryFn: () => api.getLegalityProject() });

  const legalityByBlok = new Map((legalityQ.data || []).map((l: any) => [l.blok_kavling, l]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable testID="back-btn" onPress={() => router.back()} hitSlop={8}>
            <Icon name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.h1}>Legalitas</Text>
        </View>
        <View style={styles.tabs}>
          <Pressable onPress={() => setTab("unit")} style={[styles.tab, tab === "unit" && styles.tabActive]}>
            <Text style={[styles.tabText, tab === "unit" && styles.tabTextActive]}>Per Unit</Text>
          </Pressable>
          <Pressable onPress={() => setTab("project")} style={[styles.tab, tab === "project" && styles.tabActive]}>
            <Text style={[styles.tabText, tab === "project" && styles.tabTextActive]}>Proyek</Text>
          </Pressable>
        </View>
      </View>

      {tab === "unit" ? (
        unitsQ.isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.brandPrimary} /> :
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          {(unitsQ.data || []).map((u: any) => {
            const l = legalityByBlok.get(u.blok_kavling) || {};
            return (
              <Pressable key={u.blok_kavling} style={styles.card}
                onPress={() => editable && setEditing({ ...l, blok_kavling: u.blok_kavling })}>
                <Text style={styles.cardTitle}>Blok {u.blok_kavling}</Text>
                <LegalRow label="Sertifikat" status={l.status_sertifikat} info={l.nomor_sertifikat} />
                <LegalRow label="IMB/PBG" status={l.status_imb_pbg} info={l.nomor_imb_pbg} />
                <LegalRow label="PBB" status={l.status_pbb} info={l.nop} />
                <LegalRow label="SSP/PPh" status={l.status_ssp_pph} />
                <LegalRow label="BPHTB" status={l.status_bphtb} />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        projectQ.isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.brandPrimary} /> :
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={styles.card}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.cardTitle}>Legalitas Proyek</Text>
              {editable && (
                <Pressable testID="edit-project-legality" onPress={() => setEditingProject(true)}>
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
        </ScrollView>
      )}

      <EditLegalityUnit
        data={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["legality"] }); }}
      />
      <EditLegalityProject
        visible={editingProject}
        initial={projectQ.data}
        onClose={() => setEditingProject(false)}
        onSaved={() => { setEditingProject(false); qc.invalidateQueries({ queryKey: ["legality_project"] }); }}
      />
    </View>
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

function EditLegalityUnit({ data, onClose, onSaved }: any) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const statusQ = useQuery({ queryKey: ["list", "legality_status"], queryFn: () => api.getList("legality_status"), enabled: !!data });

  useEffect(() => { if (data) setForm(data); }, [data]);
  const opts = (statusQ.data?.items || []).map((i: any) => ({ label: i.name, value: i.name }));

  const save = async () => {
    setSaving(true);
    try { await api.updateLegality(data.blok_kavling, form); onSaved(); } finally { setSaving(false); }
  };

  if (!data) return null;
  return (
    <Modal visible={!!data} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md }}>
              <Text style={styles.modalTitle}>Legalitas Blok {data.blok_kavling}</Text>
              <Pressable onPress={onClose}><Icon name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 500 }}>
              <SelectField label="Status Sertifikat" value={form.status_sertifikat} options={opts} onChange={(v: any) => setForm({ ...form, status_sertifikat: v })} />
              <Field label="Nomor Sertifikat" value={form.nomor_sertifikat} onChange={(v: any) => setForm({ ...form, nomor_sertifikat: v })} />
              <SelectField label="Status IMB/PBG" value={form.status_imb_pbg} options={opts} onChange={(v: any) => setForm({ ...form, status_imb_pbg: v })} />
              <Field label="Nomor IMB/PBG" value={form.nomor_imb_pbg} onChange={(v: any) => setForm({ ...form, nomor_imb_pbg: v })} />
              <SelectField label="Status PBB" value={form.status_pbb} options={opts} onChange={(v: any) => setForm({ ...form, status_pbb: v })} />
              <Field label="NOP" value={form.nop} onChange={(v: any) => setForm({ ...form, nop: v })} />
              <SelectField label="Status SSP/PPh" value={form.status_ssp_pph} options={opts} onChange={(v: any) => setForm({ ...form, status_ssp_pph: v })} />
              <SelectField label="Status BPHTB" value={form.status_bphtb} options={opts} onChange={(v: any) => setForm({ ...form, status_bphtb: v })} />
              <Field label="Keterangan" value={form.keterangan} onChange={(v: any) => setForm({ ...form, keterangan: v })} multiline />
            </ScrollView>
            <Pressable testID="save-legality-button" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Simpan</Text>}
            </Pressable>
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
              <Pressable onPress={onClose}><Icon name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 500 }}>
              <Field label="Sertifikat Tanah Induk" value={form.sertifikat_tanah_induk} onChange={(v: any) => setForm({ ...form, sertifikat_tanah_induk: v })} />
              <Field label="Nomor Sertifikat" value={form.nomor_sertifikat} onChange={(v: any) => setForm({ ...form, nomor_sertifikat: v })} />
              <Field label="IMB/PBG" value={form.imb_pbg} onChange={(v: any) => setForm({ ...form, imb_pbg: v })} />
              <Field label="No IMB/PBG" value={form.nomor_imb_pbg} onChange={(v: any) => setForm({ ...form, nomor_imb_pbg: v })} />
              <Field label="PKKPR" value={form.pkkpr} onChange={(v: any) => setForm({ ...form, pkkpr: v })} />
              <Field label="SLF" value={form.slf} onChange={(v: any) => setForm({ ...form, slf: v })} />
              <Field label="Catatan Umum" value={form.catatan_umum} onChange={(v: any) => setForm({ ...form, catatan_umum: v })} multiline />
            </ScrollView>
            <Pressable onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Simpan</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  h1: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  tabs: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, padding: 4, borderRadius: radius.md },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4 },
  tabText: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  tabTextActive: { color: colors.brandPrimary },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm },
  legalRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, gap: spacing.sm },
  legalLabel: { fontSize: 13, color: colors.muted, flex: 0.6 },
  legalInfo: { fontSize: 12, color: colors.onSurface },
  legalStatus: { fontSize: 12, fontWeight: "700" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "92%" },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  saveBtn: { backgroundColor: colors.brandPrimary, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  saveBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700" },
});
