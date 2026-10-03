import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, TextInput, Platform } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { downloadFile, formatBytes, formatDateTime, storageDownloadUrl } from "@/src/report-utils";

type Props = {
  scope: "unit" | "project";
  blok?: string;
  editable: boolean;
};

/** Daftar dokumen legalitas (scan/foto) + upload (admin legal) + unduh (semua user). */
export function LegalDocs({ scope, blok, editable }: Props) {
  const qc = useQueryClient();
  const [jenis, setJenis] = useState("");
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const docsQ = useQuery({
    queryKey: ["legal_docs", scope, blok || ""],
    queryFn: () => api.listLegalityDocs(scope, blok),
  });
  const typesQ = useQuery({
    queryKey: ["list", "legality_doc_types"],
    queryFn: () => api.getList("legality_doc_types"),
    enabled: editable,
  });
  const docs: any[] = docsQ.data || [];
  const types: string[] = (typesQ.data?.items || []).map((i: any) => i.name);

  const refresh = () => qc.invalidateQueries({ queryKey: ["legal_docs", scope, blok || ""] });

  const upload = async (uri: string, name: string, type: string) => {
    setBusy(true); setErr(null);
    try {
      await api.uploadLegalityDoc({ scope, blok_kavling: blok, jenis: jenis || "Lainnya", catatan }, uri, name, type);
      setCatatan("");
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Upload gagal");
    } finally {
      setBusy(false);
    }
  };

  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setErr("Izin kamera ditolak"); return; }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      await upload(a.uri, a.fileName || `scan-${Date.now()}.jpg`, a.mimeType || "image/jpeg");
    }
  };
  const fromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      await upload(a.uri, a.fileName || `scan-${Date.now()}.jpg`, a.mimeType || "image/jpeg");
    }
  };
  const fromFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      await upload(a.uri, a.name || `dokumen-${Date.now()}.pdf`, a.mimeType || "application/pdf");
    }
  };

  const open = async (d: any) => {
    try {
      const url = await storageDownloadUrl(d.path, d.nama_file);
      await downloadFile(url, d.nama_file, d.content_type);
    } catch (e: any) {
      setErr(e?.message || "Gagal mengunduh");
    }
  };
  const remove = async (d: any) => {
    try { await api.deleteLegalityDoc(d.id); await refresh(); }
    catch (e: any) { setErr(e?.message || "Gagal menghapus"); }
  };

  return (
    <View style={styles.wrap} testID={`legal-docs-${scope}-${blok || "project"}`}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.title}>Dokumen Scan / Foto ({docs.length})</Text>
        {docsQ.isFetching && <ActivityIndicator size="small" color={colors.brandPrimary} />}
      </View>

      {docs.length === 0 && !docsQ.isLoading && (
        <Text style={styles.empty}>Belum ada dokumen diunggah</Text>
      )}
      {docs.map((d) => {
        const isPdf = (d.content_type || "").includes("pdf");
        return (
          <View key={d.id} style={styles.docRow} testID={`legal-doc-${d.id}`}>
            <View style={[styles.docIcon, { backgroundColor: isPdf ? "#FEE2E2" : colors.brandSecondary }]}>
              <Icon name={isPdf ? "document-text" : "image"} size={18} color={isPdf ? colors.error : colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.docJenis}>{d.jenis}</Text>
              <Text style={styles.docMeta} numberOfLines={1}>{d.nama_file} · {formatBytes(d.ukuran)}</Text>
              <Text style={styles.docMeta}>{formatDateTime(d.uploaded_at)} · {d.uploaded_name || d.uploaded_by}</Text>
              {!!d.catatan && <Text style={styles.docMeta}>{d.catatan}</Text>}
            </View>
            <Pressable onPress={() => open(d)} style={styles.dlBtn} hitSlop={6} testID={`download-doc-${d.id}`}>
              <Icon name="download-outline" size={18} color={colors.onBrandPrimary} />
            </Pressable>
            {editable && (
              <Pressable onPress={() => remove(d)} hitSlop={6} style={{ marginLeft: spacing.xs }}>
                <Icon name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            )}
          </View>
        );
      })}

      {editable && (
        <View style={styles.uploadBox}>
          <Text style={styles.uploadLabel}>Unggah dokumen baru</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
            {types.map((t) => {
              const active = (jenis || "Lainnya") === t;
              return (
                <Pressable key={t} onPress={() => setJenis(t)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{t}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <TextInput
            value={catatan}
            onChangeText={setCatatan}
            placeholder="Catatan (opsional)"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center", flexWrap: "wrap" }}>
            {Platform.OS !== "web" && (
              <Pressable onPress={fromCamera} style={styles.btn} disabled={busy} testID="legal-camera-btn">
                <Icon name="camera" size={15} color={colors.onBrandPrimary} />
                <Text style={styles.btnText}>Kamera</Text>
              </Pressable>
            )}
            <Pressable onPress={fromGallery} style={[styles.btn, styles.btnAlt]} disabled={busy}>
              <Icon name="images" size={15} color={colors.onSurface} />
              <Text style={[styles.btnText, { color: colors.onSurface }]}>Galeri</Text>
            </Pressable>
            <Pressable onPress={fromFile} style={[styles.btn, styles.btnAlt]} disabled={busy} testID="legal-file-btn">
              <Icon name="document-attach" size={15} color={colors.onSurface} />
              <Text style={[styles.btnText, { color: colors.onSurface }]}>File / PDF</Text>
            </Pressable>
            {busy && <ActivityIndicator color={colors.brandPrimary} />}
          </View>
        </View>
      )}

      {err && (
        <View style={styles.errBox}>
          <Icon name="alert-circle" size={14} color={colors.error} />
          <Text style={{ color: colors.error, fontSize: 12, flex: 1 }}>{err}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.sm },
  title: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  empty: { fontSize: 12, color: colors.muted, paddingVertical: spacing.sm },
  docRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, padding: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  docIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  docJenis: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  docMeta: { fontSize: 11, color: colors.muted, marginTop: 1 },
  dlBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  uploadBox: {
    gap: spacing.sm, padding: spacing.md, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", backgroundColor: colors.surface,
  },
  uploadLabel: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceSecondary },
  chip: { paddingHorizontal: spacing.md, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: 12, color: colors.onSurface, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, paddingHorizontal: spacing.md,
    paddingVertical: 8, color: colors.onSurface, fontSize: 13, borderWidth: 1, borderColor: colors.border, outlineWidth: 0 as any,
  },
  btn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.md },
  btnAlt: { backgroundColor: colors.surfaceTertiary },
  btnText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "600" },
  errBox: { flexDirection: "row", gap: spacing.sm, alignItems: "center", backgroundColor: "#FEE2E2", padding: spacing.sm, borderRadius: radius.sm },
});
