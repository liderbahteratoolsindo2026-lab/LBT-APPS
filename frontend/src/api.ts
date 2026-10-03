import { Platform } from "react-native";
import { auth } from "./auth-storage";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

let activeProjectId: string | null = null;
export function setActiveProjectId(id: string | null) {
  activeProjectId = id;
}

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
  if (activeProjectId) headers.set("X-Project-Id", activeProjectId);
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
  changePassword: (current_password: string, new_password: string) =>
    request("/api/auth/password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),

  // users
  listUsers: () => request("/api/users"),
  createUser: (data: any) => request("/api/users", { method: "POST", body: JSON.stringify(data) }),
  deleteUser: (u: string) => request(`/api/users/${u}`, { method: "DELETE" }),
  resetPassword: (u: string, new_password: string) =>
    request(`/api/users/${u}/password`, { method: "POST", body: JSON.stringify({ new_password }) }),

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
    const uh: any = {};
    if (token) uh.Authorization = `Bearer ${token}`;
    if (activeProjectId) uh["X-Project-Id"] = activeProjectId;
    const resp = await fetch(`${API}/api/units/${blok}/photo`, {
      method: "POST",
      body: form,
      headers: uh,
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
    if (activeProjectId) q.set("project", activeProjectId);
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
    const uh: any = {};
    if (token) uh.Authorization = `Bearer ${token}`;
    if (activeProjectId) uh["X-Project-Id"] = activeProjectId;
    const resp = await fetch(`${API}/api/legality/docs`, {
      method: "POST", body: form,
      headers: uh,
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

  // projects (multi-proyek)
  listProjects: () => request("/api/projects"),
  createProject: (d: any) => request("/api/projects", { method: "POST", body: JSON.stringify(d) }),
  updateProject: (id: string, d: any) => request(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: "DELETE" }),

  // marketing dashboard
  marketingDashboard: (params: { month?: string; marketing?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.month) q.set("month", params.month);
    if (params.marketing) q.set("marketing", params.marketing);
    const qs = q.toString();
    return request(`/api/dashboard/marketing${qs ? "?" + qs : ""}`);
  },

  // AI
  aiChat: (d: { message: string; provider: string; session_id?: string; mode?: string }) =>
    request("/api/ai/chat", { method: "POST", body: JSON.stringify(d) }),
  aiHistory: (session_id: string) => request(`/api/ai/history?session_id=${encodeURIComponent(session_id)}`),
  aiImage: (prompt: string) => request("/api/ai/image", { method: "POST", body: JSON.stringify({ prompt }) }),

  // social login + user email
  googleSession: (session_id: string) =>
    request("/api/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }),
  appleLogin: (d: { identity_token: string; email?: string | null; name?: string | null }) =>
    request("/api/auth/apple", { method: "POST", body: JSON.stringify(d) }),
  setUserEmail: (u: string, email: string | null) =>
    request(`/api/users/${u}/email`, { method: "PUT", body: JSON.stringify({ email }) }),
};
