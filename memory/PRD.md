# PRD - Mahkota Graha KPR Monitoring App

## Overview
Full-stack mobile (Expo) + web application for monitoring KPR subsidized housing process at Mahkota Graha Subang (PT Lider Bahtera Toolsindo). Unifies 3 Google Sheets data sources (Berkas KPR, Progres Bangunan, Legalitas) into one integrated app with role-based access.

## Tech Stack
- **Backend**: FastAPI + MongoDB (motor async), JWT auth, bcrypt
- **Frontend**: Expo Router (React Native + Web), @tanstack/react-query
- **Storage**: Emergent Managed Object Storage (construction photos)
- **Auth**: Username+password JWT with SecureStore (mobile) / localStorage (web)

## Core Modules
1. **Dashboard** - KPIs (Total, Proses, SP3K, Done, Diputihkan, Jatuh Tempo), rekap per marketing/bank, unit summary, nearing-pemutihan alerts
2. **Berkas KPR** - CRUD mortgage files; unit validation (must have progress > 0% AND unused); auto-compute status PROSES/SP3K/DONE/DIPUTIHKAN
3. **Progres Bangunan** - Unit list with progress bars; detail with camera/gallery photo upload; stage selection auto-computes %
4. **Legalitas** - Per-unit documents (sertifikat/IMB/PBB/SSP/BPHTB) + project legality
5. **Pengaturan** (Admin Utama only) - Manage all dropdown lists, pemutihan days, project/company name
6. **Kelola User** (Admin Utama) - Create/delete admins with 4 roles
7. **Log Hapus** - Audit log of deleted KPR records
8. **Tabel Unit Gabungan** - Combined view (blok, consumer, KPR status, construction, legality)

## Business Rules Implemented
- Pemutihan: default 14 days configurable; auto-DIPUTIHKAN if PROSES past booking + N days without SP3K
- SP3K cases cannot be bleached
- New KPR entry: unit must have construction started (percent > 0) AND not actively used
- blok_kavling connects all 3 entities
- Deleting dropdown items preserves historical data

## Seed Data
- Default admin: `admin / Admin@123`
- 8 sample units (A-01..A-05, B-01..B-03) with various construction stages
- Default lists: Marketing (Rina/Budi/Siti/Agus), Banks (BTN/BRI/BNI/Mandiri/BJB), KPR stages (Pemberkasan→Akad), 11 Construction stages with milestones, 3 Legality statuses

## Iterasi 2 (Juni 2026) - Selesai
- Tema biru korporat (brand #1E3A8A / primary #1D4ED8) di theme.ts + design_guidelines.json
- Role baru `marketing` (freelance): akun terikat `marketing_name` (dipilih dari daftar Pengaturan saat buat user). Hanya bisa tambah/ubah/hapus berkas atas nama sendiri; berkas lain read-only ("Hanya lihat")
- Riwayat perubahan berkas KPR (`kpr_history`): DIBUAT / DIUBAH (field, dari → ke) / DIPUTIHKAN / PEMUTIHAN DIBATALKAN; modal "Riwayat" di tiap kartu
- Pemutihan manual oleh Admin Utama/Admin KPR: `POST /api/kpr/{id}/putihkan` (alasan) → status DIPUTIHKAN & blok dilepas untuk konsumen baru; `POST /api/kpr/{id}/batal-putihkan` (hanya jika blok belum dipakai berkas aktif). Tidak bisa untuk SP3K/Akad
- Foto timeline bangunan (`unit_photos`): semua foto tersimpan (tahap, %, catatan, pengunggah, waktu); galeri thumbnail + hapus
- Dashboard: filter Bulan (12 bulan terakhir) & Marketing; tombol Export Excel/PDF
- Laporan `GET /api/reports/monthly?format=xlsx|pdf&month&marketing` (openpyxl/reportlab). Cakupan per role: admin_utama = lengkap; admin_kpr & marketing = sheet KPR saja (marketing dipaksa filter nama sendiri); admin_bangunan = Progres Bangunan; admin_legal = Legalitas
- Legalitas jadi tab utama (5 tab). Dokumen scan/foto/PDF per unit & proyek (`legality_docs`, Object Storage): upload/hapus admin_utama & admin_legal; semua role bisa unduh (`/api/files/{path}?download=`). Jenis dokumen dikelola di Pengaturan (`legality_doc_types`)
- Login tidak lagi menampilkan kredensial default

## Iterasi 3 (Juni 2026) - Selesai
- Ubah password sendiri (`POST /api/auth/password`, Lainnya > Ubah Password) & reset password oleh Admin Utama (`POST /api/users/{u}/password`, ikon kunci di Kelola User). Min 6 karakter
- Filter cepat tab Berkas KPR: Semua / Segera Diputihkan (≤3 hari) / Proses / SP3K / Done / Diputihkan
- Pencarian + filter jenis di daftar dokumen legalitas
- Cabang Pemroses (list `branches`: Subang, Bekasi, Purwakarta; dikelola di Pengaturan) pada berkas KPR; masuk laporan
- Aturan tahap (`apply_stage_rules`): tgl SP3K/Akad otomatis terisi saat tahap jadi Sp3k/Akad (admin tetap bisa edit manual); marketing tidak bisa set Sp3k/Akad (403) & tgl SP3K/Akad dikunci
- Catatan proses per update tahap (`catatan_update` → `keterangan_tahap` di record + `catatan` di riwayat), opsional. Tampil di kartu & modal Riwayat
- Branding: nama aplikasi **LBT One**, logo/emblem PT Lider Bahtera Toolsindo (assets/images/logo-lbt.png, emblem.png, icon, adaptive-icon, favicon, splash putih), title web "LBT One"

## Backlog
- Import data existing dari 4 Google Sheets: link yang dikirim user masih butuh login Google (401). Minta user set sharing "Anyone with the link → Viewer" atau upload file .xlsx/.csv

## Status: Iterasi 2 Complete
