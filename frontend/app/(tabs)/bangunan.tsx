import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useAuth, canEdit } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Badge, statusToKind } from "@/src/badge";
import { Field, SelectField } from "./kpr";

export default function BangunanScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const editable = canEdit(user?.role, "unit");
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);

  const { data = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["units"], queryFn: () => api.listUnits(),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.h1}>Progres Bangunan</Text>
        <Text style={styles.subtitle}>{data.length} unit</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.brandPrimary} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => it.blok_kavling}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <Pressable
              testID={`unit-card-${item.blok_kavling}`}
              style={styles.card}
              onPress={() => setSelected(item)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>Blok {item.blok_kavling}</Text>
                  <Text style={styles.meta}>{item.nama_kontraktor || "—"} · {item.tahap_konstruksi || "—"}</Text>
                </View>
                <Badge label={item.status_bangunan} kind={statusToKind(item.status_bangunan)} />
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${item.persen_progres}%`,
                  backgroundColor: item.status_bangunan === "TERLAMBAT" ? colors.error
                    : item.persen_progres >= 100 ? colors.success : colors.brandPrimary }]} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.footText}>Progres</Text>
                <Text style={[styles.footText, { fontWeight: "800", color: colors.onSurface }]}>{item.persen_progres}%</Text>
              </View>
            </Pressable>
          )}
        />
      )}
      <UnitDetail
        unit={selected}
        editable={editable}
        onClose={() => setSelected(null)}
        onSaved={() => { setSelected(null); qc.invalidateQueries({ queryKey: ["units"] }); }}
      />
    </View>
  );
}

function UnitDetail({ unit, editable, onClose, onSaved }: any) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<any>({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (unit) {
      setForm({
        blok_kavling: unit.blok_kavling,
        nama_kontraktor: unit.nama_kontraktor || "",
        tahap_konstruksi: unit.tahap_konstruksi || "",
        tanggal_mulai: unit.tanggal_mulai || "",
        tanggal_target_selesai: unit.tanggal_target_selesai || "",
        tanggal_realisasi_selesai: unit.tanggal_realisasi_selesai || "",
        kendala_catatan: unit.kendala_catatan || "",
        link_foto_dokumentasi: unit.link_foto_dokumentasi || "",
      });
      setErr(null);
      if (unit.foto_path) {
        api.fileUrl(unit.foto_path).then(setPhotoUrl);
      } else {
        setPhotoUrl(null);
      }
    }
  }, [unit]);

  const stagesQ = useQuery({
    queryKey: ["list", "construction_stages"],
    queryFn: () => api.getList("construction_stages"),
    enabled: !!unit,
  });

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setErr("Izin kamera ditolak"); return; }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!res.canceled && res.assets[0]) await doUpload(res.assets[0]);
  };

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!res.canceled && res.assets[0]) await doUpload(res.assets[0]);
  };

  const doUpload = async (asset: any) => {
    setUploading(true); setErr(null);
    try {
      const name = asset.fileName || `photo-${Date.now()}.jpg`;
      const type = asset.mimeType || "image/jpeg";
      const resp = await api.uploadPhoto(unit.blok_kavling, asset.uri, name, type);
      const url = await api.fileUrl(resp.path);
      setPhotoUrl(url);
    } catch (e: any) {
      setErr(e?.message || "Upload gagal");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await api.updateUnit(unit.blok_kavling, {
        ...form,
        tanggal_mulai: form.tanggal_mulai || null,
        tanggal_target_selesai: form.tanggal_target_selesai || null,
        tanggal_realisasi_selesai: form.tanggal_realisasi_selesai || null,
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!unit} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <Text style={styles.modalTitle}>Blok {unit?.blok_kavling}</Text>
              <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 540 }} showsVerticalScrollIndicator={false}>
              {/* Photo */}
              <View style={styles.photoBox}>
                {photoUrl ? (
                  <Image source={{ uri: photoUrl, headers: Platform.OS !== "web" ? undefined : undefined }}
                    style={{ width: "100%", height: 180, borderRadius: radius.sm }} contentFit="cover" />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Icon name="camera" size={32} color={colors.muted} />
                    <Text style={{ color: colors.muted, marginTop: spacing.xs }}>Belum ada foto</Text>
                  </View>
                )}
                {editable && (
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                    <Pressable testID="camera-button" onPress={pickFromCamera} style={styles.photoBtn} disabled={uploading}>
                      <Icon name="camera" size={16} color={colors.onBrandPrimary} />
                      <Text style={styles.photoBtnText}>Kamera</Text>
                    </Pressable>
                    <Pressable onPress={pickFromGallery} style={[styles.photoBtn, { backgroundColor: colors.surfaceTertiary }]} disabled={uploading}>
                      <Icon name="images" size={16} color={colors.onSurface} />
                      <Text style={[styles.photoBtnText, { color: colors.onSurface }]}>Galeri</Text>
                    </Pressable>
                    {uploading && <ActivityIndicator color={colors.brandPrimary} />}
                  </View>
                )}
              </View>

              <Field label="Nama Kontraktor" value={form.nama_kontraktor} onChange={(v: any) => setForm({ ...form, nama_kontraktor: v })} />
              <SelectField label="Tahap Konstruksi" value={form.tahap_konstruksi}
                options={(stagesQ.data?.items || []).map((i: any) => ({ label: `${i.name} (${i.extra?.percent ?? 0}%)`, value: i.name }))}
                onChange={(v: any) => setForm({ ...form, tahap_konstruksi: v })} />
              <Field label="Tanggal Mulai (YYYY-MM-DD)" value={form.tanggal_mulai} onChange={(v: any) => setForm({ ...form, tanggal_mulai: v })} />
              <Field label="Target Selesai" value={form.tanggal_target_selesai} onChange={(v: any) => setForm({ ...form, tanggal_target_selesai: v })} />
              <Field label="Realisasi Selesai (opsional)" value={form.tanggal_realisasi_selesai} onChange={(v: any) => setForm({ ...form, tanggal_realisasi_selesai: v })} />
              <Field label="Kendala / Catatan" value={form.kendala_catatan} onChange={(v: any) => setForm({ ...form, kendala_catatan: v })} multiline />
            </ScrollView>
            {err && (
              <View style={styles.errorBox}>
                <Icon name="alert-circle" size={16} color={colors.error} />
                <Text style={{ color: colors.error, flex: 1, fontSize: 13 }}>{err}</Text>
              </View>
            )}
            {editable && (
              <Pressable testID="save-unit-button" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Simpan</Text>}
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  h1: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  progressTrack: { height: 8, backgroundColor: colors.surfaceTertiary, borderRadius: 4, overflow: "hidden" },
  progressBar: { height: "100%", borderRadius: 4 },
  footText: { fontSize: 11, color: colors.muted },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "95%" },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },

  photoBox: { marginBottom: spacing.lg },
  photoPlaceholder: {
    height: 180, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed",
  },
  photoBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md,
  },
  photoBtnText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "600" },

  errorBox: { flexDirection: "row", gap: spacing.sm, backgroundColor: "#FEE2E2", padding: spacing.md, borderRadius: radius.sm, marginVertical: spacing.sm, alignItems: "center" },
  saveBtn: { backgroundColor: colors.brandPrimary, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  saveBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700" },
});
