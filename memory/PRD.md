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

## Iterasi 4 (Juni 2026) - Selesai (backend terverifikasi)
- Import data existing dari 4 Google Sheets (share "Anyone with link"): script `/app/backend/seed_from_sheets.py` ubah URL ke `/export?format=csv`, parse, isi ke proyek "Mahkota Graha I" (36 unit, 25 KPR, 12 legalitas). Marketing & bank list diupdate ke data asli (HAWIG/ADIT/WIDA/SRI).
- Multi-proyek: koleksi `projects`, field `project_id` di units/kpr/legality/photos/docs, index unik `(project_id, blok_kavling)`. Scoping via header `X-Project-Id` (dependency `current_project`). CRUD `/api/projects` (Admin Utama). Switcher proyek di Dashboard; kelola proyek di Pengaturan. Nama proyek "Mahkota Graha I" (tanpa "Subang").
- Dashboard Marketing: `GET /api/dashboard/marketing` → ringkasan pribadi (total, segera diputihkan, perlu tindak lanjut, SP3K, done, masuk bulan ini, target). Target per marketing diatur Admin di Pengaturan (`marketing_targets`).
- Reminder Berkas Macet: `perlu_tindak_lanjut` (status PROSES/SP3K tanpa update > 7 hari) → label "Perlu Tindak Lanjut" + filter di tab KPR + KPI + alert Dashboard.
- Ekspor Riwayat: laporan Excel kini punya sheet "Riwayat Perubahan" (audit perubahan tiap berkas).
- AI Asisten (tab Lainnya → AI Asisten): chat tanya-jawab data + ringkasan otomatis + bantu tulis catatan, pilih model Claude (`claude-sonnet-5-5`) / ChatGPT (`gpt-5.6-terra`); generate gambar (Gemini nano banana). Pakai EMERGENT_LLM_KEY.
- Social login: Google (Emergent managed) `POST /api/auth/session` & Apple (iOS, verifikasi JWKS) `POST /api/auth/apple` → cocokkan `email` user terdaftar → JWT. Email user diatur di Kelola User. Login username/password tetap jalan.

## Status: Iterasi 4 Complete

## Iterasi 4.1 (Juni 2026) - Selesai (penyesuaian dashboard & input)
- Dashboard KPI: "Done" → "Done (Akad)"; "Total Berkas" → "Total Berjalan" (tidak menghitung yang sudah akad); tambah KPI "Pemberkasan" (baru booking/pemberkasan). SP3K tetap = SP3K belum akad.
- KPI bisa diklik → modal rincian berkas (nama, blok, marketing, tahap, status, tgl). Dari modal, Admin Utama & Admin KPR bisa "Putihkan" berkas PROSES dan "Aktifkan lagi" (batal putih) berkas DIPUTIHKAN (blok kembali bisa dibooking).
- Rekap per Marketing indikator baru: Berjalan (booking/pemberkasan/proses), SP3K (belum akad), Akad (done), Diputihkan — ikut filter bulan.
- Legalitas: nomor sertifikat/IMB/NOP tidak ditampilkan (hanya status Done/Proses/Rencana); bisa dilihat semua role, hanya Admin Legal/Utama yang bisa ubah.
- Input tanggal (booking, mulai, target, realisasi) kini pakai KALENDER (DateField, react-native-calendars), tampil dd/mm/yyyy, simpan ISO.
- Fix: index unik email users pakai partialFilterExpression type string + omit field bila kosong (bug 500 saat buat >1 user tanpa email).

## Iterasi 5 (Juni 2026) - Security Audit & Fixes (terverifikasi testing agent 20/20)
- SEC-001 (HIGH): Marketing kini hanya bisa MEMBACA berkasnya sendiri (list_kpr, dashboard, combined-table, riwayat berkas, konteks AI difilter marketing_name). Sebelumnya bisa lihat data semua marketing via API.
- SEC-002 (HIGH): Login Apple hanya percaya email dari klaim token Apple terverifikasi (tolak jika tidak ada / belum verified); email dari client diabaikan -> cegah account takeover.
- SEC-005 (MEDIUM): GET /api/ai/history difilter per username -> tidak bisa baca percakapan AI user lain.
- SEC-003 (HIGH): Admin seed pada DB baru diberi flag must_change_password=True; frontend ((tabs)/_layout.tsx) memaksa ganti password sebelum pakai app. Admin dev existing tidak diberi flag agar Admin@123 tetap valid untuk uji.
- Belum dikerjakan (hardening P3, opsional): rate limit login, CORS allowlist, kebijakan password lebih kuat, scope file /api/files per proyek/role (risiko rendah utk tool internal).

## Status: Iterasi 5 Complete (Security)

## Iterasi 6 (Juni 2026) - Fitur operasional & hardening (terverifikasi 20/20 + E2E)
- Tab Bangunan: Admin Utama & Admin Bangunan bisa TAMBAH blok/kavling baru (tombol "Tambah Blok" + form: blok, kontraktor, tahap, tgl kalender). Unit baru otomatis tersedia untuk booking di tab Berkas KPR setelah tahap > 0% (KPR form blok memakai available_units).
- Tab Legalitas: Admin Utama & Admin Legal bisa TAMBAH legalitas (tombol "Tambah Legalitas") dengan pilih blok dari unit ATAU ketik blok baru manual, lalu isi status (Rencana/Proses/Done). Legalitas blok non-unit tetap tampil (label "tanpa data unit").
- Tombol "Tarik Data Terbaru" (Pengaturan, Admin Utama): POST /api/admin/sync-sheets menarik data dari 4 Google Sheet ke proyek aktif, mode TAMBAH/UPDATE (upsert by project+blok / project+blok+nama), tidak menghapus, dan tidak menimpa field khusus app (bank, cabang, catatan). Idempoten.
- Kebijakan password (semua create/change/reset): minimal 8 karakter + wajib huruf & angka (validate_password + Pydantic min_length=8).
- Lockout login: 5x gagal -> akun terkunci 15 menit (429), reset counter saat login sukses / admin reset. Disimpan di field user failed_login_attempts & locked_until. Pesan generik + hint sisa percobaan.

## Status: Iterasi 6 Complete

## Iterasi 7 (Juni 2026) - Bug fix: Filter bulan Dashboard (terverifikasi 9/9 + E2E)
- Masalah: pilih bulan di Dashboard selalu kosong. Penyebab: (1) filter hanya cek tanggal_booking yang KOSONG pada data import; (2) chip bulan dibuat dari bulan kalender terkini, tak cocok dgn tanggal data (SP3K/akad ada di 2026-09 & 2026-10).
- Fix backend: helper _kpr_in_month mencocokkan booking/SP3K/akad/pemutihan; dipakai di build_dashboard_data & marketing_dashboard (bulan_ini).
- Fix frontend: opsi bulan (monthOptions) dibangun dari tanggal yang benar-benar ada di data KPR (via api.listKpr), fallback recentMonths bila kosong.
