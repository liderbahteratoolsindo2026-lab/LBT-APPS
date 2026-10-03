import { Tabs } from "expo-router";
import Icon from "@react-native-vector-icons/ionicons";
import { Platform } from "react-native";
import { colors } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

export default function TabsLayout() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin_utama";

  return (
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
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <Icon name="grid" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="kpr"
        options={{
          title: "Berkas KPR",
          tabBarIcon: ({ color, size }) => <Icon name="document-text" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bangunan"
        options={{
          title: "Bangunan",
          tabBarIcon: ({ color, size }) => <Icon name="construct" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Lainnya",
          tabBarIcon: ({ color, size }) => <Icon name="settings" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
