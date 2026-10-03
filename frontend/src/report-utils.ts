import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api } from "./api";

const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/** Unduh laporan bulanan. Web: buka tab download. Native: simpan ke cache lalu buka share sheet. */
export async function downloadReport(params: { month?: string; marketing?: string; format: "xlsx" | "pdf" }) {
  const url = await api.reportUrl(params);
  const name = `laporan-kpr-${params.month || "semua"}-${Date.now()}.${params.format}`;
  await downloadFile(url, name, MIME[params.format]);
}

/** Unduh file apa pun (dokumen legalitas, foto). Web: tab baru. Native: cache + share sheet. */
export async function downloadFile(url: string, filename: string, mimeType?: string) {
  if (Platform.OS === "web") {
    window.open(url, "_blank");
    return;
  }
  const safe = filename.replace(/[^\w.\-]+/g, "_");
  const dest = new File(Paths.cache, `${Date.now()}-${safe}`);
  const file = await File.downloadFileAsync(url, dest);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: "Simpan / bagikan file" });
  }
}

/** URL unduh file storage dengan header attachment */
export async function storageDownloadUrl(path: string, filename: string) {
  const token = await api.getToken();
  return `${api.fileUrlWithToken(path, token)}&download=${encodeURIComponent(filename)}`;
}

export function formatBytes(n?: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Label bulan "YYYY-MM" -> "Jun 2026" */
export function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${names[(m || 1) - 1]} ${y}`;
}

/** 12 bulan terakhir, terbaru dulu */
export function recentMonths(count = 12): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** "2026-06-03T10:20:00+00:00" -> "03 Jun 2026 10:20" (waktu lokal) */
export function formatDateTime(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const names = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${String(d.getDate()).padStart(2, "0")} ${names[d.getMonth()]} ${d.getFullYear()} ${hh}:${mm}`;
}
