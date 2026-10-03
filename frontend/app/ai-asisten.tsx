import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useProject } from "@/src/project-context";
import { colors, spacing, radius } from "@/src/theme";

type Msg = { role: "user" | "assistant"; content: string };

const PROVIDERS = [
  { key: "claude", label: "Claude", icon: "sparkles" },
  { key: "chatgpt", label: "ChatGPT", icon: "chatbubble-ellipses" },
];

const QUICK = [
  { label: "Ringkasan status proyek", msg: "Buat ringkasan status proyek saat ini.", mode: "summary" },
  { label: "Berkas perlu tindak lanjut", msg: "Daftar berkas yang perlu tindak lanjut dan saran aksinya.", mode: "summary" },
  { label: "Berapa berkas SP3K?", msg: "Berapa jumlah berkas berstatus SP3K? sebutkan namanya.", mode: "chat" },
];

export default function AiAsisten() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeProject } = useProject();
  const [provider, setProvider] = useState("claude");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<any>(null);

  // image generation
  const [imgOpen, setImgOpen] = useState(false);
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgBusy, setImgBusy] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  const send = async (text: string, mode: string = "chat") => {
    const msg = text.trim();
    if (!msg || busy) return;
    setErr(null);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    setBusy(true);
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 50);
    try {
      const res = await api.aiChat({ message: msg, provider, session_id: sessionId, mode });
      setSessionId(res.session_id);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (e: any) {
      setErr(e?.message || "AI gagal merespons");
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 80);
    }
  };

  const genImage = async () => {
    if (!imgPrompt.trim() || imgBusy) return;
    setImgBusy(true); setErr(null); setImgUrl(null);
    try {
      const res = await api.aiImage(imgPrompt.trim());
      const url = await api.fileUrl(res.path);
      setImgUrl(url);
    } catch (e: any) {
      setErr(e?.message || "Gagal membuat gambar");
    } finally {
      setImgBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable onPress={() => router.back()} hitSlop={8}><Icon name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>AI Asisten</Text>
            <Text style={styles.sub}>{activeProject?.name || "Proyek"} · tanya data, ringkasan & gambar</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
          {PROVIDERS.map((p) => (
            <Pressable key={p.key} testID={`ai-provider-${p.key}`} onPress={() => setProvider(p.key)}
              style={[styles.provChip, provider === p.key && styles.provChipActive]}>
              <Icon name={p.icon as any} size={14} color={provider === p.key ? colors.onBrandPrimary : colors.brandPrimary} />
              <Text style={[styles.provText, provider === p.key && { color: colors.onBrandPrimary }]}>{p.label}</Text>
            </Pressable>
          ))}
          <Pressable testID="ai-image-toggle" onPress={() => setImgOpen((v) => !v)}
            style={[styles.provChip, imgOpen && styles.provChipActive]}>
            <Icon name="image" size={14} color={imgOpen ? colors.onBrandPrimary : colors.brandPrimary} />
            <Text style={[styles.provText, imgOpen && { color: colors.onBrandPrimary }]}>Gambar</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAwareScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
      >
        {imgOpen && (
          <View style={styles.imgCard}>
            <Text style={styles.cardTitle}>Buat Gambar (AI)</Text>
            <TextInput testID="ai-image-prompt" value={imgPrompt} onChangeText={setImgPrompt}
              placeholder="mis. ilustrasi banner perumahan subsidi modern"
              placeholderTextColor={colors.muted} style={styles.input} multiline />
            <Pressable testID="ai-image-generate" onPress={genImage} disabled={imgBusy} style={[styles.genBtn, imgBusy && { opacity: 0.6 }]}>
              {imgBusy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.genBtnText}>Generate Gambar</Text>}
            </Pressable>
            {imgUrl && (
              <Image source={imgUrl} style={styles.genImage} contentFit="cover" />
            )}
          </View>
        )}

        {messages.length === 0 && !imgOpen && (
          <View style={styles.emptyCard}>
            <Icon name="sparkles" size={28} color={colors.brandPrimary} />
            <Text style={styles.emptyTitle}>Tanyakan apa saja tentang data proyek</Text>
            <Text style={styles.emptySub}>Pilih salah satu di bawah atau ketik pertanyaan Anda.</Text>
            <View style={{ gap: spacing.sm, width: "100%", marginTop: spacing.sm }}>
              {QUICK.map((q) => (
                <Pressable key={q.label} testID={`ai-quick-${q.mode}`} onPress={() => send(q.msg, q.mode)} style={styles.quickBtn}>
                  <Icon name="flash" size={15} color={colors.brandPrimary} />
                  <Text style={styles.quickText}>{q.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble]}>
            <Text style={[styles.bubbleText, m.role === "user" && { color: colors.onBrandPrimary }]}>{m.content}</Text>
          </View>
        ))}
        {busy && (
          <View style={[styles.bubble, styles.aiBubble, { flexDirection: "row", gap: spacing.sm }]}>
            <ActivityIndicator size="small" color={colors.brandPrimary} />
            <Text style={styles.bubbleText}>Memproses…</Text>
          </View>
        )}
        {err && <Text style={{ color: colors.error, fontSize: 12 }}>{err}</Text>}
      </KeyboardAwareScrollView>

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput
          testID="ai-input"
          value={input}
          onChangeText={setInput}
          placeholder="Ketik pertanyaan…"
          placeholderTextColor={colors.muted}
          style={styles.chatInput}
          multiline
          onSubmitEditing={() => send(input)}
        />
        <Pressable testID="ai-send" onPress={() => send(input)} disabled={busy || !input.trim()}
          style={[styles.sendBtn, (busy || !input.trim()) && { opacity: 0.5 }]}>
          <Icon name="send" size={18} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  h1: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  provChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  provChipActive: { backgroundColor: colors.brandPrimary },
  provText: { fontSize: 12, fontWeight: "700", color: colors.brandPrimary },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, minHeight: 44, outlineWidth: 0 as any },
  imgCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  genBtn: { backgroundColor: colors.brandPrimary, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  genBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  genImage: { width: "100%", height: 220, borderRadius: radius.md, marginTop: spacing.sm, backgroundColor: colors.surfaceSecondary },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: spacing.xs },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface, textAlign: "center", marginTop: spacing.sm },
  emptySub: { fontSize: 12, color: colors.muted, textAlign: "center" },
  quickBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandSecondary, borderRadius: radius.sm, padding: spacing.md },
  quickText: { fontSize: 13, fontWeight: "600", color: colors.onBrandSecondary, flex: 1 },
  bubble: { maxWidth: "88%", borderRadius: radius.md, padding: spacing.md },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary },
  aiBubble: { alignSelf: "flex-start", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  chatInput: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, color: colors.onSurface, maxHeight: 120, borderWidth: 1, borderColor: colors.border, outlineWidth: 0 as any },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
});
