import { Platform } from "react-native";
import { auth } from "./auth-storage";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export class ApiError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

async function request(path: string, init: RequestInit = {}) {
  const token = await auth.getToken();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(`${API}${path}`, { ...init, headers });
  const text = await resp.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!resp.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${resp.status}`;
    throw new ApiError(resp.status, typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  // auth
  login: (username: string, password: string) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => request("/api/auth/me"),

  // users
  listUsers: () => request("/api/users"),
  createUser: (data: any) => request("/api/users", { method: "POST", body: JSON.stringify(data) }),
  deleteUser: (u: string) => request(`/api/users/${u}`, { method: "DELETE" }),

  // settings
  getList: (key: string) => request(`/api/settings/lists/${key}`),
  putList: (key: string, items: any[]) =>
    request(`/api/settings/lists/${key}`, { method: "PUT", body: JSON.stringify({ items }) }),
  getConfig: (key: string) => request(`/api/settings/config/${key}`),
  putConfig: (key: string, value: any) =>
    request(`/api/settings/config/${key}`, { method: "PUT", body: JSON.stringify({ value }) }),

  // kpr
  listKpr: () => request("/api/kpr"),
  createKpr: (d: any) => request("/api/kpr", { method: "POST", body: JSON.stringify(d) }),
  updateKpr: (id: string, d: any) => request(`/api/kpr/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteKpr: (id: string) => request(`/api/kpr/${id}`, { method: "DELETE" }),
  kprHistory: (id: string) => request(`/api/kpr/${id}/history`),
  putihkanKpr: (id: string, alasan: string) =>
    request(`/api/kpr/${id}/putihkan`, { method: "POST", body: JSON.stringify({ alasan }) }),
  batalPutihkanKpr: (id: string) => request(`/api/kpr/${id}/batal-putihkan`, { method: "POST" }),
  deletedLog: () => request("/api/kpr/deleted-log"),

  // units
  listUnits: () => request("/api/units"),
  availableUnits: () => request("/api/units/available"),
  upsertUnit: (d: any) => request("/api/units", { method: "POST", body: JSON.stringify(d) }),
  updateUnit: (blok: string, d: any) => request(`/api/units/${blok}`, { method: "PUT", body: JSON.stringify(d) }),
  listPhotos: (blok: string) => request(`/api/units/${blok}/photos`),
  deletePhoto: (blok: string, id: string) => request(`/api/units/${blok}/photos/${id}`, { method: "DELETE" }),
  uploadPhoto: async (blok: string, uri: string, name: string, type: string, catatan = "") => {
    const form = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      form.append("file", blob, name);
    } else {
      form.append("file", { uri, name, type } as any);
    }
    form.append("catatan", catatan);
    const token = await auth.getToken();
    const resp = await fetch(`${API}/api/units/${blok}/photo`, {
      method: "POST",
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!resp.ok) throw new ApiError(resp.status, await resp.text());
    return resp.json();
  },
  getToken: () => auth.getToken(),
  fileUrlWithToken: (path: string, token: string | null) =>
    `${API}/api/files/${path}?token=${encodeURIComponent(token || "")}`,
  fileUrl: async (path: string) => {
    if (!path) return null;
    const token = await auth.getToken();
    return `${API}/api/files/${path}?token=${encodeURIComponent(token || "")}`;
  },
  reportUrl: async (params: { month?: string; marketing?: string; format: "xlsx" | "pdf" }) => {
    const token = await auth.getToken();
    const q = new URLSearchParams({ format: params.format, token: token || "" });
    if (params.month) q.set("month", params.month);
    if (params.marketing) q.set("marketing", params.marketing);
    return `${API}/api/reports/monthly?${q.toString()}`;
  },

  // legality
  listLegality: () => request("/api/legality/units"),
  updateLegality: (blok: string, d: any) =>
    request(`/api/legality/units/${blok}`, { method: "PUT", body: JSON.stringify(d) }),
  getLegalityProject: () => request("/api/legality/project"),
  putLegalityProject: (d: any) =>
    request("/api/legality/project", { method: "PUT", body: JSON.stringify(d) }),
  listLegalityDocs: (scope: "unit" | "project", blok?: string) => {
    const q = new URLSearchParams({ scope });
    if (blok) q.set("blok", blok);
    return request(`/api/legality/docs?${q.toString()}`);
  },
  deleteLegalityDoc: (id: string) => request(`/api/legality/docs/${id}`, { method: "DELETE" }),
  uploadLegalityDoc: async (
    params: { scope: "unit" | "project"; blok_kavling?: string; jenis: string; catatan?: string },
    uri: string, name: string, type: string,
  ) => {
    const form = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      form.append("file", blob, name);
    } else {
      form.append("file", { uri, name, type } as any);
    }
    form.append("scope", params.scope);
    form.append("blok_kavling", params.blok_kavling || "");
    form.append("jenis", params.jenis);
    form.append("catatan", params.catatan || "");
    const token = await auth.getToken();
    const resp = await fetch(`${API}/api/legality/docs`, {
      method: "POST", body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!resp.ok) {
      let msg = await resp.text();
      try { msg = JSON.parse(msg).detail || msg; } catch {}
      throw new ApiError(resp.status, msg);
    }
    return resp.json();
  },

  // dashboard
  dashboard: (params: { month?: string; marketing?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.month) q.set("month", params.month);
    if (params.marketing) q.set("marketing", params.marketing);
    const qs = q.toString();
    return request(`/api/dashboard${qs ? "?" + qs : ""}`);
  },
  combinedTable: () => request("/api/dashboard/combined-table"),
};
