import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useAuth, canEdit } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Badge, statusToKind } from "@/src/badge";
import { Field, SelectField } from "./kpr";
import { DateField } from "@/src/components/date-field";
import { formatDateTime } from "@/src/report-utils";

export default function BangunanScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const editable = canEdit(user?.role, "unit");
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [adding, setAdding] = useState(false);

  const { data = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["units"], queryFn: () => api.listUnits(),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={styles.h1}>Progres Bangunan</Text>
            <Text style={styles.subtitle}>{data.length} unit</Text>
          </View>
          {editable && (
            <Pressable testID="add-unit-button" onPress={() => setAdding(true)} style={styles.addBtn}>
              <Icon name="add" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.addBtnText}>Tambah Blok</Text>
            </Pressable>
          )}
        </View>
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
      <AddUnitModal
        visible={adding}
        existingBloks={data.map((d: any) => d.blok_kavling)}
        onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["units"] }); }}
      />
    </View>
  );
}

function AddUnitModal({ visible, existingBloks, onClose, onSaved }: any) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<any>({ blok_kavling: "", nama_kontraktor: "", tahap_konstruksi: "", tanggal_mulai: "", tanggal_target_selesai: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stagesQ = useQuery({ queryKey: ["list", "construction_stages"], queryFn: () => api.getList("construction_stages"), enabled: visible });

  useEffect(() => {
    if (visible) { setForm({ blok_kavling: "", nama_kontraktor: "", tahap_konstruksi: "", tanggal_mulai: "", tanggal_target_selesai: "" }); setErr(null); }
  }, [visible]);

  const save = async () => {
    const blok = (form.blok_kavling || "").trim();
    if (!blok) { setErr("Blok/Kavling wajib diisi"); return; }
    if (existingBloks.includes(blok)) { setErr("Blok sudah ada di proyek ini"); return; }
    setSaving(true); setErr(null);
    try {
      await api.upsertUnit({
        blok_kavling: blok,
        nama_kontraktor: form.nama_kontraktor || "",
        tahap_konstruksi: form.tahap_konstruksi || "Rencana Bangun",
        tanggal_mulai: form.tanggal_mulai || null,
        tanggal_target_selesai: form.tanggal_target_selesai || null,
        tanggal_realisasi_selesai: null,
        kendala_catatan: "",
        link_foto_dokumentasi: "",
      });
      onSaved();
    } catch (e: any) { setErr(e?.message || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <Text style={styles.modalTitle}>Tambah Blok / Kavling</Text>
              <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              <Field label="Blok / Kavling (mis. A5/10)" value={form.blok_kavling} onChange={(v: any) => setForm({ ...form, blok_kavling: v })} />
              <Field label="Nama Kontraktor" value={form.nama_kontraktor} onChange={(v: any) => setForm({ ...form, nama_kontraktor: v })} />
              <SelectField label="Tahap Konstruksi" value={form.tahap_konstruksi}
                options={(stagesQ.data?.items || []).map((i: any) => ({ label: `${i.name} (${i.extra?.percent ?? 0}%)`, value: i.name }))}
                onChange={(v: any) => setForm({ ...form, tahap_konstruksi: v })} />
              <DateField label="Tanggal Mulai" value={form.tanggal_mulai} onChange={(v: any) => setForm({ ...form, tanggal_mulai: v })} />
              <DateField label="Target Selesai" value={form.tanggal_target_selesai} onChange={(v: any) => setForm({ ...form, tanggal_target_selesai: v })} />
              <Text style={{ fontSize: 11, color: colors.muted }}>Catatan: unit baru bisa dibooking di tab Berkas KPR setelah tahap konstruksi {'>'} 0%.</Text>
            </ScrollView>
            {err && (
              <View style={styles.errorBox}>
                <Icon name="alert-circle" size={16} color={colors.error} />
                <Text style={{ color: colors.error, flex: 1, fontSize: 13 }}>{err}</Text>
              </View>
            )}
            <Pressable testID="save-new-unit-button" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Simpan Blok Baru</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function UnitDetail({ unit, editable, onClose, onSaved }: any) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState<any>(null);
  const [catatanFoto, setCatatanFoto] = useState("");

  useEffect(() => { api.getToken().then(setToken); }, []);

  const photosQ = useQuery({
    queryKey: ["unit_photos", unit?.blok_kavling],
    queryFn: () => api.listPhotos(unit.blok_kavling),
    enabled: !!unit,
  });
  const photos: any[] = photosQ.data || [];
  const shown = activePhoto || photos[0] || null;

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
      setActivePhoto(null);
      setCatatanFoto("");
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
      const resp = await api.uploadPhoto(unit.blok_kavling, asset.uri, name, type, catatanFoto.trim());
      setCatatanFoto("");
      setActivePhoto(resp.photo || null);
      await qc.invalidateQueries({ queryKey: ["unit_photos", unit.blok_kavling] });
      qc.invalidateQueries({ queryKey: ["units"] });
    } catch (e: any) {
      setErr(e?.message || "Upload gagal");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (p: any) => {
    try {
      await api.deletePhoto(unit.blok_kavling, p.id);
      if (activePhoto?.id === p.id) setActivePhoto(null);
      await qc.invalidateQueries({ queryKey: ["unit_photos", unit.blok_kavling] });
      qc.invalidateQueries({ queryKey: ["units"] });
    } catch (e: any) {
      setErr(e?.message || "Gagal menghapus foto");
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
              {/* Foto Timeline */}
              <View style={styles.photoBox}>
                {shown ? (
                  <View>
                    <Image source={{ uri: api.fileUrlWithToken(shown.path, token) }}
                      style={{ width: "100%", height: 200, borderRadius: radius.sm }} contentFit="cover"
                      transition={150} />
                    <View style={styles.photoCaption}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.photoCapTitle}>
                          {shown.tahap_konstruksi || "-"} · {shown.persen_progres ?? 0}%
                        </Text>
                        <Text style={styles.photoCapSub}>
                          {formatDateTime(shown.uploaded_at)} · {shown.uploaded_name || shown.uploaded_by}
                        </Text>
                        {!!shown.catatan && <Text style={styles.photoCapSub}>{shown.catatan}</Text>}
                      </View>
                      {editable && (
                        <Pressable onPress={() => removePhoto(shown)} hitSlop={8} testID="delete-photo-btn">
                          <Icon name="trash-outline" size={18} color={colors.error} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Icon name="camera" size={32} color={colors.muted} />
                    <Text style={{ color: colors.muted, marginTop: spacing.xs }}>Belum ada foto</Text>
                  </View>
                )}

                {photos.length > 0 && (
                  <View style={{ marginTop: spacing.sm }}>
                    <Text style={styles.timelineTitle}>Galeri Timeline ({photos.length} foto)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}>
                      {photos.map((p) => {
                        const active = shown?.id === p.id;
                        return (
                          <Pressable key={p.id} onPress={() => setActivePhoto(p)}
                            style={[styles.thumbWrap, active && styles.thumbActive]} testID={`photo-thumb-${p.id}`}>
                            <Image source={{ uri: api.fileUrlWithToken(p.path, token) }}
                              style={styles.thumb} contentFit="cover" />
                            <Text style={styles.thumbDate} numberOfLines={1}>{(p.uploaded_at || "").slice(0, 10)}</Text>
                            <Text style={styles.thumbStage} numberOfLines={1}>{p.persen_progres ?? 0}%</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {editable && (
                  <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                    <TextInput
                      value={catatanFoto}
                      onChangeText={setCatatanFoto}
                      placeholder="Catatan foto (opsional)"
                      placeholderTextColor={colors.muted}
                      style={styles.catatanInput}
                    />
                    <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
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
                  </View>
                )}
              </View>

              <Field label="Nama Kontraktor" value={form.nama_kontraktor} onChange={(v: any) => setForm({ ...form, nama_kontraktor: v })} />
              <SelectField label="Tahap Konstruksi" value={form.tahap_konstruksi}
                options={(stagesQ.data?.items || []).map((i: any) => ({ label: `${i.name} (${i.extra?.percent ?? 0}%)`, value: i.name }))}
                onChange={(v: any) => setForm({ ...form, tahap_konstruksi: v })} />
              <DateField label="Tanggal Mulai" value={form.tanggal_mulai} onChange={(v: any) => setForm({ ...form, tanggal_mulai: v })} />
              <DateField label="Target Selesai" value={form.tanggal_target_selesai} onChange={(v: any) => setForm({ ...form, tanggal_target_selesai: v })} />
              <DateField label="Realisasi Selesai (opsional)" value={form.tanggal_realisasi_selesai} onChange={(v: any) => setForm({ ...form, tanggal_realisasi_selesai: v })} />
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
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.md },
  addBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
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
  photoCaption: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.brandSecondary, padding: spacing.sm, borderBottomLeftRadius: radius.sm, borderBottomRightRadius: radius.sm,
    marginTop: -radius.sm, paddingTop: spacing.sm + radius.sm / 2,
  },
  photoCapTitle: { fontSize: 12, fontWeight: "700", color: colors.onBrandSecondary },
  photoCapSub: { fontSize: 11, color: colors.muted, marginTop: 1 },
  timelineTitle: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceSecondary, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 },
  thumbWrap: { width: 84, borderRadius: radius.sm, borderWidth: 2, borderColor: "transparent", padding: 2 },
  thumbActive: { borderColor: colors.brandPrimary },
  thumb: { width: 76, height: 60, borderRadius: 4, backgroundColor: colors.surfaceTertiary },
  thumbDate: { fontSize: 10, color: colors.onSurfaceSecondary, marginTop: 2, fontWeight: "600" },
  thumbStage: { fontSize: 10, color: colors.muted },
  catatanInput: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, paddingHorizontal: spacing.md,
    paddingVertical: 8, color: colors.onSurface, fontSize: 13, borderWidth: 1, borderColor: colors.border, outlineWidth: 0 as any,
  },
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
