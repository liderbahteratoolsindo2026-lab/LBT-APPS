import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal } from "react-native";
import { Calendar } from "react-native-calendars";
import Icon from "@react-native-vector-icons/ionicons";
import { colors, spacing, radius } from "@/src/theme";

function fmt(iso?: string) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function DateField({
  label, value, onChange, placeholder = "Pilih tanggal (kalender)", allowClear = true, testID,
}: {
  label: string;
  value?: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6, marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable testID={testID} onPress={() => setOpen(true)} style={styles.input}>
        <Icon name="calendar" size={16} color={colors.brandPrimary} />
        <Text style={[styles.val, !value && { color: colors.muted }]}>{value ? fmt(value) : placeholder}</Text>
        {allowClear && value ? (
          <Pressable onPress={() => onChange("")} hitSlop={8}>
            <Icon name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        ) : (
          <Icon name="chevron-down" size={16} color={colors.muted} />
        )}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.calCard} onPress={() => {}}>
            <Calendar
              current={value ? value.slice(0, 10) : undefined}
              onDayPress={(d: any) => { onChange(d.dateString); setOpen(false); }}
              markedDates={value ? { [value.slice(0, 10)]: { selected: true, selectedColor: colors.brandPrimary } } : {}}
              enableSwipeMonths
              theme={{
                todayTextColor: colors.brandPrimary,
                arrowColor: colors.brandPrimary,
                selectedDayBackgroundColor: colors.brandPrimary,
                textMonthFontWeight: "700",
              }}
            />
            <Pressable testID="date-cancel" onPress={() => setOpen(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>Tutup</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceSecondary },
  input: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 46, borderWidth: 1, borderColor: colors.border },
  val: { flex: 1, fontSize: 14, color: colors.onSurface },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  calCard: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: "hidden" },
  closeBtn: { padding: spacing.md, alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border },
  closeText: { fontSize: 14, fontWeight: "700", color: colors.brandPrimary },
});
