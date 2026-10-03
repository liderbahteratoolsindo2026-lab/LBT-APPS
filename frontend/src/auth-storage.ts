import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY_TOKEN = "mg_token";
const KEY_USER = "mg_user";

async function get(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function set(key: string, value: string) {
  if (Platform.OS === "web") {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function remove(key: string) {
  if (Platform.OS === "web") {
    try {
      window.localStorage.removeItem(key);
    } catch {}
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const auth = {
  getToken: () => get(KEY_TOKEN),
  setToken: (t: string) => set(KEY_TOKEN, t),
  clearToken: () => remove(KEY_TOKEN),
  getUser: async () => {
    const raw = await get(KEY_USER);
    return raw ? JSON.parse(raw) : null;
  },
  setUser: (u: any) => set(KEY_USER, JSON.stringify(u)),
  clearUser: () => remove(KEY_USER),
};

export type User = {
  username: string;
  name: string;
  role: "admin_utama" | "admin_kpr" | "admin_legal" | "admin_bangunan" | "marketing";
  marketing_name?: string | null;
  email?: string | null;
};
