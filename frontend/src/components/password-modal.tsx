import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Jika diisi: mode reset oleh Admin Utama untuk user ini. Jika kosong: ubah password sendiri. */
  targetUsername?: string | null;
};

export function PasswordModal({ visible, onClose, targetUsername }: Props) {
  const insets = useSafeAreaInsets();
  const isReset = !!targetUsername;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => { setCurrent(""); setNext(""); setConfirm(""); setErr(null); setOk(false); setShow(false); }, [visible, targetUsername]);

  const submit = async () => {
    setErr(null);
    if (next.length < 6) { setErr("Password baru minimal 6 karakter"); return; }
    if (next !== confirm) { setErr("Konfirmasi password tidak sama"); return; }
    setBusy(true);
    try {
      if (isReset) await api.resetPassword(targetUsername!, next);
      else await api.changePassword(current, next);
      setOk(true);
      setTimeout(onClose, 900);
    } catch (e: any) {
      setErr(e?.message || "Gagal menyimpan password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.wrap}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <View style={[styles.card, { paddingBottom: insets.bottom + spacing.lg }]} testID="password-modal">
            <View style={styles.handle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{isReset ? "Reset Password" : "Ubah Password"}</Text>
                {isReset && <Text style={styles.sub}>Untuk user @{targetUsername}</Text>}
              </View>
              <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={24} color={colors.muted} /></Pressable>
            </View>

            {!isReset && (
              <Input label="Password saat ini" value={current} onChange={setCurrent} secure={!show} testID="pwd-current" />
            )}
            <Input label="Password baru (min. 6 karakter)" value={next} onChange={setNext} secure={!show} testID="pwd-new" />
            <Input label="Ulangi password baru" value={confirm} onChange={setConfirm} secure={!show} testID="pwd-confirm" />
            <Pressable onPress={() => setShow((v) => !v)} style={styles.showRow} hitSlop={6}>
              <Icon name={show ? "eye-off-outline" : "eye-outline"} size={16} color={colors.muted} />
              <Text style={{ fontSize: 12, color: colors.muted }}>{show ? "Sembunyikan" : "Tampilkan"} password</Text>
            </Pressable>

            {err && (
              <View style={styles.errBox}>
                <Icon name="alert-circle" size={16} color={colors.error} />
                <Text style={{ color: colors.error, flex: 1, fontSize: 13 }}>{err}</Text>
              </View>
            )}
            {ok && (
              <View style={[styles.errBox, { backgroundColor: "#DCFCE7" }]} testID="pwd-success">
                <Icon name="checkmark-circle" size={16} color={colors.success} />
                <Text style={{ color: colors.success, flex: 1, fontSize: 13 }}>Password berhasil disimpan</Text>
              </View>
            )}
            <Pressable testID="pwd-submit" onPress={submit} disabled={busy} style={[styles.btn, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Simpan Password</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Input({ label, value, onChange, secure, testID }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  card: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  handle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginBottom: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  label: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceSecondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10,
    color: colors.onSurface, fontSize: 14, borderWidth: 1, borderColor: colors.border, outlineWidth: 0 as any,
  },
  showRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginBottom: spacing.sm, minHeight: 32 },
  errBox: { flexDirection: "row", gap: spacing.sm, backgroundColor: "#FEE2E2", padding: spacing.md, borderRadius: radius.sm, marginBottom: spacing.sm, alignItems: "center" },
  btn: { backgroundColor: colors.brandPrimary, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  btnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700" },
});
