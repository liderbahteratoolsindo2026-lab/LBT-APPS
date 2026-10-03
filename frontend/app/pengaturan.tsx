import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

const LIST_CONFIGS: { key: string; title: string; hasPercent?: boolean }[] = [
  { key: "marketing", title: "Marketing" },
  { key: "banks", title: "Bank Pemroses" },
  { key: "kpr_stages", title: "Tahapan Berkas KPR" },
  { key: "construction_stages", title: "Tahapan Konstruksi", hasPercent: true },
  { key: "legality_status", title: "Status Dokumen Legalitas" },
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
});
