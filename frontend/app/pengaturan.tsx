import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useProject } from "@/src/project-context";
import { colors, spacing, radius } from "@/src/theme";

const LIST_CONFIGS: { key: string; title: string; hasPercent?: boolean }[] = [
  { key: "marketing", title: "Marketing" },
  { key: "banks", title: "Bank Pemroses" },
  { key: "branches", title: "Cabang Pemroses" },
  { key: "kpr_stages", title: "Tahapan Berkas KPR" },
  { key: "construction_stages", title: "Tahapan Konstruksi", hasPercent: true },
  { key: "legality_status", title: "Status Dokumen Legalitas" },
  { key: "legality_doc_types", title: "Jenis Dokumen Legalitas (Upload)" },
];

export default function Pengaturan() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [pemutihan, setPemutihan] = useState("14");
  const [projectName, setProjectName] = useState("");
  const [companyName, setCompanyName] = useState("");

  const qc = useQueryClient();
  const pemQ = useQuery({ queryKey: ["pemutihan"], queryFn: () => api.getConfig("pemutihan_days") });
  const projectQ = useQuery({ queryKey: ["project_info"], queryFn: () => api.getConfig("project_info") });

  useEffect(() => {
    if (pemQ.data?.value != null) setPemutihan(String(pemQ.data.value));
    if (projectQ.data?.value) {
      setProjectName(projectQ.data.value.project_name || "");
      setCompanyName(projectQ.data.value.company_name || "");
    }
  }, [pemQ.data, projectQ.data]);

  const savePem = async () => {
    await api.putConfig("pemutihan_days", parseInt(pemutihan, 10) || 14);
    qc.invalidateQueries({ queryKey: ["pemutihan"] });
  };
  const saveProject = async () => {
    await api.putConfig("project_info", { project_name: projectName, company_name: companyName });
    qc.invalidateQueries({ queryKey: ["project_info"] });
  };

  if (selected) return <ListEditor keyName={selected} onBack={() => setSelected(null)}
    hasPercent={LIST_CONFIGS.find((c) => c.key === selected)?.hasPercent}
    title={LIST_CONFIGS.find((c) => c.key === selected)?.title || ""} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable onPress={() => router.back()} hitSlop={8}><Icon name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
          <Text style={styles.h1}>Pengaturan</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Info Proyek</Text>
          <Text style={styles.label}>Nama Perumahan</Text>
          <TextInput testID="input-project-name" value={projectName} onChangeText={setProjectName} style={styles.input} />
          <Text style={styles.label}>Nama Perusahaan</Text>
          <TextInput testID="input-company-name" value={companyName} onChangeText={setCompanyName} style={styles.input} />
          <Pressable testID="save-project-info" onPress={saveProject} style={styles.saveBtn}><Text style={styles.saveBtnText}>Simpan</Text></Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Jangka Pemutihan</Text>
          <Text style={styles.label}>Jumlah hari sejak booking</Text>
          <TextInput testID="input-pemutihan" value={pemutihan} onChangeText={setPemutihan} keyboardType="numeric" style={styles.input} />
          <Pressable testID="save-pemutihan" onPress={savePem} style={styles.saveBtn}><Text style={styles.saveBtnText}>Simpan</Text></Pressable>
        </View>

        <Text style={styles.sectionTitle}>Multi-Proyek</Text>
        <ProjectsCard />
        <TargetsCard />
        <SyncSheetCard />

        <Text style={styles.sectionTitle}>Daftar Referensi</Text>
        {LIST_CONFIGS.map((c) => (
          <Pressable key={c.key} testID={`list-${c.key}`} style={styles.row} onPress={() => setSelected(c.key)}>
            <Icon name="list-circle" size={20} color={colors.brandPrimary} />
            <Text style={styles.rowLabel}>{c.title}</Text>
            <Icon name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function ListEditor({ keyName, title, hasPercent, onBack }: any) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["list", keyName], queryFn: () => api.getList(keyName) });
  const [items, setItems] = useState<any[]>([]);
  const [newName, setNewName] = useState("");
  const [newPct, setNewPct] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data?.items) setItems(data.items); }, [data]);

  const add = () => {
    if (!newName.trim()) return;
    const item: any = { id: `new-${Date.now()}`, name: newName.trim(), order: items.length };
    if (hasPercent) item.extra = { percent: parseInt(newPct, 10) || 0 };
    setItems([...items, item]);
    setNewName(""); setNewPct("");
  };

  const update = (idx: number, patch: any) => {
    const next = [...items]; next[idx] = { ...next[idx], ...patch }; setItems(next);
  };
  const updatePct = (idx: number, pct: string) => {
    const next = [...items]; next[idx] = { ...next[idx], extra: { ...(next[idx].extra || {}), percent: parseInt(pct, 10) || 0 } }; setItems(next);
  };
  const remove = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir; if (j < 0 || j >= items.length) return;
    const next = [...items]; [next[idx], next[j]] = [next[j], next[idx]];
    setItems(next.map((it, i) => ({ ...it, order: i })));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.putList(keyName, items.map((it, i) => ({ ...it, order: i })));
      qc.invalidateQueries({ queryKey: ["list", keyName] });
      onBack();
    } finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable onPress={onBack} hitSlop={8}><Icon name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
          <Text style={styles.h1}>{title}</Text>
        </View>
      </View>
      {isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.brandPrimary} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 80 }}>
          {items.map((it, idx) => (
            <View key={it.id} style={styles.itemCard}>
              <TextInput value={it.name} onChangeText={(v) => update(idx, { name: v })} style={[styles.input, { flex: 1 }]} />
              {hasPercent && (
                <TextInput value={String(it.extra?.percent ?? 0)} onChangeText={(v) => updatePct(idx, v)}
                  keyboardType="numeric" style={[styles.input, { width: 70 }]} />
              )}
              <Pressable onPress={() => move(idx, -1)} hitSlop={8}><Icon name="arrow-up" size={18} color={colors.muted} /></Pressable>
              <Pressable onPress={() => move(idx, 1)} hitSlop={8}><Icon name="arrow-down" size={18} color={colors.muted} /></Pressable>
              <Pressable onPress={() => remove(idx)} hitSlop={8}><Icon name="trash" size={18} color={colors.error} /></Pressable>
            </View>
          ))}
          <View style={[styles.itemCard, { backgroundColor: colors.surfaceSecondary }]}>
            <TextInput placeholder="Nama baru" value={newName} onChangeText={setNewName}
              placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} />
            {hasPercent && (
              <TextInput placeholder="%" value={newPct} onChangeText={setNewPct} keyboardType="numeric"
                placeholderTextColor={colors.muted} style={[styles.input, { width: 70 }]} />
            )}
            <Pressable testID="add-list-item" onPress={add} style={styles.addSmall}>
              <Icon name="add" size={18} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
          <Pressable testID="save-list" onPress={save} disabled={saving} style={[styles.saveBtn, { marginTop: spacing.md }, saving && { opacity: 0.6 }]}>
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Simpan Perubahan</Text>}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function SyncSheetCard() {
  const qc = useQueryClient();
  const { activeProject } = useProject();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await api.syncSheets();
      setMsg(res.pesan || "Sinkron selesai");
      qc.invalidateQueries();
    } catch (e: any) {
      setErr(e?.message || "Gagal sinkron");
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Tarik Data dari Google Sheet</Text>
      <Text style={styles.hint}>
        Ambil data terbaru dari 4 Google Sheet ke proyek "{activeProject?.name || "-"}". Mode tambah/update:
        data baru ditambahkan & yang ada diperbarui, tanpa menghapus. Field khusus app (bank, cabang, catatan) tidak diubah.
      </Text>
      {msg && <Text style={{ color: colors.success, fontSize: 12 }}>{msg}</Text>}
      {err && <Text style={{ color: colors.error, fontSize: 12 }}>{err}</Text>}
      <Pressable testID="sync-sheets-btn" onPress={run} disabled={busy} style={[styles.saveBtn, busy && { opacity: 0.6 }]}>
        {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Tarik Data Terbaru</Text>}
      </Pressable>
    </View>
  );
}

function ProjectsCard() {
  const qc = useQueryClient();
  const { reload } = useProject();
  const { data = [] } = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects() });
  const [name, setName] = useState("");
  const [company, setCompany] = useState("PT Lider Bahtera Toolsindo");
  const [alamat, setAlamat] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["projects"] }); reload(); };

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try {
      await api.createProject({ name: name.trim(), company_name: company.trim(), alamat: alamat.trim() });
      setName(""); setAlamat("");
      refresh();
    } catch (e: any) { setErr(e?.message || "Gagal"); }
    finally { setBusy(false); }
  };
  const del = async (id: string) => {
    setErr(null);
    try { await api.deleteProject(id); refresh(); }
    catch (e: any) { setErr(e?.message || "Gagal hapus"); }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Proyek ({data.length})</Text>
      {data.map((p: any) => (
        <View key={p.id} style={styles.projRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.projName}>{p.name}</Text>
            <Text style={styles.projSub}>{p.company_name}{p.alamat ? ` · ${p.alamat}` : ""}</Text>
          </View>
          <Pressable testID={`del-project-${p.id}`} onPress={() => del(p.id)} hitSlop={8}>
            <Icon name="trash" size={18} color={colors.error} />
          </Pressable>
        </View>
      ))}
      <Text style={styles.label}>Tambah Proyek Baru</Text>
      <TextInput testID="new-project-name" placeholder="Nama proyek (mis. Mahkota Graha II)" placeholderTextColor={colors.muted}
        value={name} onChangeText={setName} style={styles.input} />
      <TextInput placeholder="Nama perusahaan" placeholderTextColor={colors.muted}
        value={company} onChangeText={setCompany} style={styles.input} />
      <TextInput placeholder="Alamat / lokasi (opsional)" placeholderTextColor={colors.muted}
        value={alamat} onChangeText={setAlamat} style={styles.input} />
      {err && <Text style={{ color: colors.error, fontSize: 12 }}>{err}</Text>}
      <Pressable testID="add-project" onPress={add} disabled={busy} style={[styles.saveBtn, busy && { opacity: 0.6 }]}>
        {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Tambah Proyek</Text>}
      </Pressable>
    </View>
  );
}

function TargetsCard() {
  const qc = useQueryClient();
  const marketingQ = useQuery({ queryKey: ["list", "marketing"], queryFn: () => api.getList("marketing") });
  const targetsQ = useQuery({ queryKey: ["marketing_targets"], queryFn: () => api.getConfig("marketing_targets") });
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const v = targetsQ.data?.value || {};
    const out: Record<string, string> = {};
    (marketingQ.data?.items || []).forEach((m: any) => { out[m.name] = String(v[m.name] ?? ""); });
    setVals(out);
  }, [targetsQ.data, marketingQ.data]);

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, number> = {};
      Object.entries(vals).forEach(([k, s]) => { payload[k] = parseInt(s, 10) || 0; });
      await api.putConfig("marketing_targets", payload);
      qc.invalidateQueries({ queryKey: ["marketing_targets"] });
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Target Bulanan Marketing</Text>
      <Text style={styles.hint}>Jumlah target berkas masuk per bulan untuk tiap marketing (0 = tidak diatur).</Text>
      {(marketingQ.data?.items || []).map((m: any) => (
        <View key={m.id} style={styles.targetRow}>
          <Text style={styles.targetName}>{m.name}</Text>
          <TextInput testID={`target-${m.name}`} value={vals[m.name] ?? ""} keyboardType="numeric"
            onChangeText={(v) => setVals((s) => ({ ...s, [m.name]: v }))}
            placeholder="0" placeholderTextColor={colors.muted} style={[styles.input, { width: 90 }]} />
        </View>
      ))}
      <Pressable testID="save-targets" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
        {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Simpan Target</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  h1: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm },
  label: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, outlineWidth: 0 as any },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface },
  itemCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  addSmall: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  saveBtn: { backgroundColor: colors.brandPrimary, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700" },
  hint: { fontSize: 11, color: colors.muted },
  projRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  projName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  projSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  targetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: 4 },
  targetName: { fontSize: 14, fontWeight: "600", color: colors.onSurface, flex: 1 },
});
