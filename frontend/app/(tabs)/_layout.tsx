import React from "react";
import { Tabs } from "expo-router";
import Icon from "@react-native-vector-icons/ionicons";
import { Platform, View, Text, StyleSheet } from "react-native";
import { colors, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth-context";
import { PasswordModal } from "@/src/components/password-modal";

export default function TabsLayout() {
  const { user, refresh } = useAuth();
  const mustChange = !!user?.must_change_password;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brandPrimary,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            ...(Platform.OS === "web" ? { height: 64 } : {}),
          },
          tabBarItemStyle: { alignSelf: "center" },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        }}
      >
        <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <Icon name="grid" size={size} color={color} /> }} />
        <Tabs.Screen name="kpr" options={{ title: "Berkas KPR", tabBarIcon: ({ color, size }) => <Icon name="document-text" size={size} color={color} /> }} />
        <Tabs.Screen name="bangunan" options={{ title: "Bangunan", tabBarIcon: ({ color, size }) => <Icon name="construct" size={size} color={color} /> }} />
        <Tabs.Screen name="legalitas" options={{ title: "Legalitas", tabBarIcon: ({ color, size }) => <Icon name="shield-checkmark" size={size} color={color} /> }} />
        <Tabs.Screen name="settings" options={{ title: "Lainnya", tabBarIcon: ({ color, size }) => <Icon name="settings" size={size} color={color} /> }} />
      </Tabs>

      {mustChange && (
        <View style={styles.forceWrap} pointerEvents="box-none" testID="force-pwd-gate">
          <View style={styles.banner}>
            <Icon name="lock-closed" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.bannerText}>Demi keamanan, ganti password default Anda sebelum melanjutkan.</Text>
          </View>
          <PasswordModal visible={true} onClose={() => refresh()} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  forceWrap: { ...StyleSheet.absoluteFillObject },
  banner: { position: "absolute", top: 60, left: spacing.lg, right: spacing.lg, backgroundColor: colors.brandPrimary, borderRadius: 10, padding: spacing.md, flexDirection: "row", gap: spacing.sm, alignItems: "center", zIndex: 10 },
  bannerText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "600", flex: 1 },
});
