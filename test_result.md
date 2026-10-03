#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Iteration 2 - Fitur baru (Juni 2026)
user_problem_statement: Tema biru, role marketing freelance (edit hanya berkas sendiri), riwayat perubahan KPR, foto timeline bangunan, filter dashboard bulan+marketing, export laporan Excel/PDF, tab Legalitas + upload/download dokumen scan.
backend:
  - task: "Role marketing + scope berkas sendiri (POST/PUT/DELETE /api/kpr)"
    implemented: true
    working: true  # smoke test /app/backend/tests/smoke_new_features.py passed
  - task: "Riwayat perubahan GET /api/kpr/{id}/history"
    implemented: true
    working: true
  - task: "Foto timeline GET/DELETE /api/units/{blok}/photos, POST photo w/ catatan"
    implemented: true
    working: "NA"  # upload needs real file via UI; list tested
  - task: "Laporan GET /api/reports/monthly?format=xlsx|pdf&month&marketing"
    implemented: true
    working: true
  - task: "Dokumen legalitas GET/POST/DELETE /api/legality/docs, download /api/files/{path}?download="
    implemented: true
    working: true
frontend:
  - task: "Tema biru (theme.ts, gradient login/dashboard)"
    implemented: true
    working: "NA"
  - task: "Dashboard filter bulan/marketing + tombol Excel/PDF"
    implemented: true
    working: "NA"
  - task: "KPR: tombol Riwayat (modal), marketing lock field, Hanya lihat untuk berkas marketing lain"
    implemented: true
    working: "NA"
  - task: "Bangunan: galeri timeline foto + catatan"
    implemented: true
    working: "NA"
  - task: "Tab Legalitas baru + LegalDocs upload/download"
    implemented: true
    working: "NA"
  - task: "Kelola User: role Marketing + pilih nama marketing"
    implemented: true
    working: "NA"

## Iteration 3 - Password, filter jatuh tempo, cari dokumen, cabang pemroses, aturan SP3K/Akad
backend (semua lolos python smoke di chat): POST /api/auth/password, POST /api/users/{u}/password (admin_utama), list `branches`, KprIn.cabang_pemroses, apply_stage_rules (marketing 403 untuk tahap Sp3k/Akad & tgl SP3K/Akad dikunci; autofill tgl saat tahap jadi Sp3k/Akad)
frontend (perlu diuji): PasswordModal (Lainnya > Ubah Password; Kelola User > ikon kunci reset), chip filter KPR (filter-all, filter-SEGERA, filter-PROSES...), field Cabang Pemroses di form, marketing tidak melihat opsi Sp3k/Akad & field tanggal, LegalDocs search (legal-doc-search) + chip jenis, Pengaturan list "Cabang Pemroses"
