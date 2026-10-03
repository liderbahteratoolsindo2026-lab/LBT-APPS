import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { spacing, radius } from "./theme";

export type StatusKind = "proses" | "sp3k" | "done" | "diputihkan" | "tersedia"
  | "belum_mulai" | "terlambat" | "rencana";

const PALETTE: Record<string, { bg: string; fg: string }> = {
  proses:    { bg: "#FEF3C7", fg: "#92400E" },  // amber
  sp3k:      { bg: "#DBEAFE", fg: "#1E3A8A" },  // blue
  done:      { bg: "#DCFCE7", fg: "#166534" },  // green
  diputihkan:{ bg: "#FEE2E2", fg: "#991B1B" },  // red
  tersedia:  { bg: "#EFF6FF", fg: "#1D4ED8" },
  belum_mulai:{ bg: "#F3F4F6", fg: "#4B5563" },
  terlambat: { bg: "#FEE2E2", fg: "#991B1B" },
  rencana:   { bg: "#F3F4F6", fg: "#4B5563" },
};

export function statusToKind(status: string): StatusKind {
  const s = (status || "").toUpperCase();
  if (s === "DONE") return "done";
  if (s === "SP3K") return "sp3k";
  if (s === "DIPUTIHKAN") return "diputihkan";
  if (s === "PROSES") return "proses";
  if (s === "TERSEDIA") return "tersedia";
  if (s === "BELUM MULAI" || s === "BELUM SIAP") return "belum_mulai";
  if (s === "TERLAMBAT") return "terlambat";
  return "rencana";
}

export function Badge({ label, kind }: { label: string; kind: StatusKind }) {
  const c = PALETTE[kind] || PALETTE.rencana;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]} testID={`badge-${kind}`}>
      <Text style={[styles.text, { color: c.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  text: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
});
