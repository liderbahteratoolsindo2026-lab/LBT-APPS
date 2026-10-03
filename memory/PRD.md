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

## Status: MVP Complete
