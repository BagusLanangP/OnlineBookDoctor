# Task 9c: Halaman Daftar Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Halaman `/bookings` di Next.js yang menampilkan booking satu hari menurut zona waktu klinik, dengan filter dokter dan status, paginasi, serta aksi "Selesai" dan "Batal".

**Architecture:** Satu halaman klien (`useEffect` + `api()`, filter di state komponen) mengikuti pola `/akun`. Logika murni (tanggal, jam, penyusun URL) ada di `lib/booking.ts` tanpa import runtime supaya bisa diuji dengan `node --test`; pembungkus API ada di `lib/booking-api.ts`. Tidak ada perubahan Laravel.

**Tech Stack:** Next.js 16.4.6, React 19.3, TypeScript strict, Tailwind 4 + `globals.css`, `node:test` bawaan Node 26 (tanpa dependensi baru).

**Spec:** `docs/TASK_9C_BOOKINGS_PAGE_DESIGN.md`

## Global Constraints

- Tanpa dependensi baru; tanpa test runner pihak ketiga (spec: "Library data fetching, test runner frontend, atau pustaka komponen" tidak dikerjakan).
- Tanggal "hari ini" dan jam memakai `clinic.timezone`, bukan zona browser.
- "Selesai" = `PUT /bookings/{id}` `{status:"completed"}`; "Batal" = `DELETE /bookings/{id}` dengan konfirmasi dua langkah di dalam baris, tanpa `window.confirm`.
- Aksi hanya muncul pada booking `confirmed`; setelah aksi, daftar dimuat ulang.
- Empat keadaan wajib: memuat, kosong, error dengan "Coba lagi", 401 → `/login` dan 403/`clinic: null` → pesan "belum terhubung ke klinik".
- Layar < 760px: baris menjadi kartu, tanpa scroll horizontal.
- Tidak ada perubahan di folder Laravel; `package-lock.json` di root tidak boleh ikut ter-commit.
- Sebelum menulis kode Next.js, baca panduan di `frontend/node_modules/next/dist/docs/` (aturan `frontend/AGENTS.md`).

## Review Focus

1. Booking tepat di batas tengah malam klinik harus tampil di hari dan jam lokal yang benar (`17:00Z` Jakarta → tanggal berikutnya, `00.00`). Diuji di Task 1.
2. `booked_time` rusak tidak boleh merusak seluruh tabel: `formatTime` mengembalikan `"-"`. Diuji di Task 1.
3. Mengganti tanggal cepat-cepat: respons lama yang tiba belakangan tidak boleh menimpa tampilan. Task 3.
4. Klik "Selesai" dua kali cepat: hanya satu permintaan. Task 3.
5. Membatalkan/menyelesaikan booking terakhir di halaman 2 (dengan filter status aktif) membuat halaman itu kosong: tampilan harus mundur ke halaman yang masih ada, bukan menampilkan "tidak ada booking". Task 3.

---

## File Structure

```
frontend/lib/booking.ts            tipe, STATUS_LABEL, todayIn, shiftDate, formatTime, bookingsPath (murni, tanpa import runtime)
frontend/lib/booking.test.ts       node:test untuk fungsi di atas
frontend/lib/booking-api.ts        fetchBookings, fetchPractitioners, markCompleted, cancelBooking (memakai api())
frontend/app/bookings/page.tsx     halaman
frontend/app/globals.css           gaya .bk-* (tabel/kartu, bilah filter), .btn--sm
frontend/app/akun/page.tsx         hapus "Uji bookings" dan countOf
frontend/lib/config.ts             LOGIN_URL = "/login"
frontend/tsconfig.json             allowImportingTsExtensions
frontend/package.json              script "test"
```

**Keadaan awal (sudah ada di working tree, belum ter-commit, dibuat pemilik proyek):** `app/bookings/page.tsx` dan `lib/booking.ts` sudah ada tetapi kosong (0 byte), dan `app/login/page.tsx` sudah memanggil `router.push("/bookings")`. Nama file `lib/booking.ts` (tunggal) mengikuti file itu, bukan `bookings.ts` seperti di rancangan.

**Dua penyimpangan dari rancangan 9C, keputusan perencana:**
1. Fungsi murni dan pembungkus API dipisah jadi dua file (rancangan menyarankan satu file). Alasannya: `node --test` tidak bisa me-resolve `@/lib/api` dan import tanpa ekstensi, jadi file yang diuji tidak boleh mengimpor `api.ts`.
2. Menambah `allowImportingTsExtensions` di `tsconfig.json` dan script `test` di `package.json`, agar file uji memakai `import … from "./booking.ts"` tanpa membuat `next build` gagal. Ini bukan test runner baru: `node:test` bawaan Node.

---

### Task 1: `lib/booking.ts` (logika murni) dan tesnya

**Files:**
- Modify: `frontend/lib/booking.ts` (saat ini kosong)
- Create: `frontend/lib/booking.test.ts`
- Modify: `frontend/tsconfig.json` (tambah `"allowImportingTsExtensions": true` di `compilerOptions`)
- Modify: `frontend/package.json` (scripts: `"test": "node --test lib/*.test.ts"`)

**Interfaces:**
- Produces (dipakai Task 2 dan 3):
  - `type BookingStatus = "confirmed" | "completed" | "cancelled"`
  - `type Booking = { id: number; practitioner_id: number; patient_name: string; patient_phone: string; visit_reason: string; booked_time: string; status: BookingStatus; practitioner: { id: number; name: string } }`
  - `type Practitioner = { id: number; name: string; specialty: string }`
  - `type Paginated<T> = { data: T[]; current_page: number; last_page: number; total: number }`
  - `type BookingFilters = { date: string; status: "" | BookingStatus; practitionerId: string; page: number }`
  - `const STATUS_LABEL: Record<BookingStatus, string>` = `{ confirmed: "Terkonfirmasi", completed: "Selesai", cancelled: "Dibatalkan" }`
  - `todayIn(tz: string, now?: Date): string`, `shiftDate(date: string, days: number): string`, `formatTime(iso: string, tz: string): string`, `bookingsPath(f: BookingFilters): string`

- [ ] **Step 1: Tulis tes yang gagal** di `lib/booking.test.ts` (`node:test` + `node:assert/strict`, impor dari `./booking.ts`). Nilai persisnya:
  - `todayIn("Asia/Jakarta", new Date("2026-11-17T17:00:00Z")) === "2026-11-18"`; `todayIn("Asia/Makassar", sama) === "2026-11-18"`; `todayIn("UTC", sama) === "2026-11-17"`; `todayIn("Asia/Jakarta", new Date("2026-11-17T16:59:59Z")) === "2026-11-17"`
  - `shiftDate("2026-11-30", 1) === "2026-12-01"`; `shiftDate("2026-12-31", 1) === "2027-01-01"`; `shiftDate("2026-03-01", -1) === "2026-02-28"`; `shiftDate("2028-03-01", -1) === "2028-02-29"`
  - `formatTime("2026-11-17T17:00:00Z", "Asia/Jakarta") === "00.00"`; `("2026-11-18T05:00:00Z", "Asia/Jakarta") === "12.00"`; `("2026-11-18T16:59:59Z", "Asia/Makassar") === "00.59"`; `("2026-11-17T17:00:00.000000Z", "Asia/Jakarta") === "00.00"` (format mikrodetik dari Laravel); `("bukan-tanggal", "Asia/Jakarta") === "-"`
  - `bookingsPath({ date: "2026-11-18", status: "", practitionerId: "", page: 1 }) === "/bookings?date=2026-11-18"`; `bookingsPath({ date: "2026-11-18", status: "confirmed", practitionerId: "3", page: 2 }) === "/bookings?date=2026-11-18&status=confirmed&practitioner_id=3&page=2"`

- [ ] **Step 2: Jalankan, pastikan gagal.** Run: `cd frontend && npm test`. Expected: gagal karena fungsi belum ada.

- [ ] **Step 3: Implementasikan** semua tipe dan fungsi di atas di `lib/booking.ts` tanpa `import` runtime. `todayIn` memakai `Intl.DateTimeFormat("en-CA", { timeZone })`; `shiftDate` memakai `Date.UTC`; `formatTime` memakai `Intl.DateTimeFormat("id-ID", { timeZone, hour: "2-digit", minute: "2-digit" })` dan mengembalikan `"-"` bila `new Date(iso)` tidak valid; `bookingsPath` memakai `URLSearchParams`, urutan `date, status, practitioner_id, page`, dan melewatkan field kosong serta `page <= 1`. Tambahkan `allowImportingTsExtensions` dan script `test`.

- [ ] **Step 4: Jalankan, pastikan lulus.** Run: `cd frontend && npm test && npx tsc --noEmit`. Expected: semua tes PASS dan `tsc` tanpa error.

- [ ] **Step 5: Commit.**
```bash
git add frontend/lib/booking.ts frontend/lib/booking.test.ts frontend/tsconfig.json frontend/package.json
git commit -m "feat: add booking date/time helpers and types"
```

---

### Task 2: `lib/booking-api.ts` (pembungkus API)

**Files:**
- Create: `frontend/lib/booking-api.ts`

**Interfaces:**
- Consumes: `api<T>(path, init)` dari `@/lib/api`; tipe `Booking`, `Paginated`, `Practitioner`, `BookingFilters`, fungsi `bookingsPath` dari `@/lib/booking`.
- Produces:
  - `fetchBookings(f: BookingFilters): Promise<Paginated<Booking>>`
  - `fetchPractitioners(): Promise<Practitioner[]>`
  - `markCompleted(id: number): Promise<Booking>`: `PUT /bookings/{id}` body `{ status: "completed" }`
  - `cancelBooking(id: number): Promise<void>`: `DELETE /bookings/{id}` (balasan 204)

- [ ] **Step 1: Pastikan bentuk respons nyata.** Run: `docker compose exec app php artisan tinker --execute='echo App\Models\Booking::with("practitioner:id,name")->paginate(20)->toJson();'`. Expected: JSON berisi `data[]` dengan `id, practitioner_id, patient_name, patient_phone, visit_reason, booked_time, status, practitioner{id,name}` serta `current_page, last_page, total`. Bila ada field yang berbeda dari tipe di Task 1, sesuaikan tipe itu dulu.

- [ ] **Step 2: Implementasikan** keempat fungsi di atas (satu baris isi masing-masing; path tanpa awalan `/api` karena `api()` menambahkannya; body dikirim lewat `JSON.stringify`).

- [ ] **Step 3: Verifikasi.** Run: `cd frontend && npx tsc --noEmit && npm run lint`. Expected: tanpa error.

- [ ] **Step 4: Commit.**
```bash
git add frontend/lib/booking-api.ts
git commit -m "feat: add booking API wrappers"
```

---

### Task 3: Halaman `/bookings`

**Files:**
- Modify: `frontend/app/bookings/page.tsx` (saat ini kosong)
- Modify: `frontend/app/globals.css` (tambah gaya `.bk-*` dan `.btn--sm`, memakai token `--paper`, `--ink`, `--muted`, `--accent-soft`, `--error`, kelas `.field` dari PR #15; tombol tetap persegi)

**Interfaces:**
- Consumes: semua fungsi dan tipe dari Task 1 dan 2; `api` dan `ApiError` dari `@/lib/api`; tipe `Me` (`{ user; clinic: { id; name; timezone } | null }`, salin dari `app/akun/page.tsx`); `LogoMark` dari `@/components/Logo`.
- Produces: rute `/bookings` (default export `BookingsPage`).

- [ ] **Step 1: Baca panduan Next.js yang relevan** di `node_modules/next/dist/docs/01-app/01-getting-started/` (`05-server-and-client-components.md`, `04-linking-and-navigating.md`, `06-fetching-data.md`) dan catat bila ada yang berbeda dari pola `/akun`.

- [ ] **Step 2: Implementasikan `BookingsPage`** (`"use client"`) sesuai spec, keputusan 1 sampai 9:
  - Muat `/user` dan `fetchPractitioners()`; 401 → `router.replace("/login")`; `clinic === null` → pesan "Akun ini belum terhubung ke klinik."
  - State `filters: BookingFilters` dimulai dari `todayIn(clinic.timezone)`; kontrol: ◀ ▶ (`shiftDate`), `<input type="date">`, tombol "Hari ini", select dokter ("Semua dokter"), select status ("Semua" + `STATUS_LABEL`), paginasi "Sebelumnya / Hal X dari Y / Berikutnya". Mengubah tanggal atau filter mengembalikan `page` ke 1.
  - Pemuatan daftar di `useEffect` dengan kunci `filters` + penghitung muat-ulang, memakai penanda urutan permintaan sehingga hanya hasil terbaru yang dipakai (Review Focus 3). Keadaan: memuat (`aria-live="polite"`), kosong ("Tidak ada booking pada tanggal ini."), error (`role="alert"` + "Coba lagi").
  - Baris: jam (`formatTime`), pasien, dokter, alasan, status (`STATUS_LABEL`), aksi. Aksi hanya untuk `confirmed`: "Selesai" memanggil `markCompleted`; "Batal" beralih ke "Yakin batal?" dengan "Ya, batalkan" (`cancelBooking`) dan "Tidak". Tombol baris dinonaktifkan selama permintaan berjalan (Review Focus 4). `aria-label` tombol menyebut nama pasien.
  - Setelah aksi sukses, muat ulang; bila hasil `data` kosong dan `page > 1`, mundur ke `min(page - 1, last_page)` (Review Focus 5). 401 saat aksi → `/login`.
  - Header: logo, nama klinik, tautan ke `/akun`. Tabel di ≥ 760px, kartu di bawahnya.

- [ ] **Step 3: Verifikasi statis.** Run: `cd frontend && npm run lint && npx tsc --noEmit && npm run build`. Expected: ketiganya tanpa error.

- [ ] **Step 4: Verifikasi di browser** (Laravel di `:8088` dengan data batas tengah malam dari panduan 9B, `npm run dev` di `:3000`). Jalankan daftar cek di spec bagian "Akses", "Tanggal dan zona waktu", "Filter", "Aksi", dan "Keadaan dan tampilan". Tambahan untuk Review Focus 5: buat 21 booking `confirmed` pada satu tanggal, buka halaman 2 dengan filter "Terkonfirmasi", tandai satu-satunya baris di sana "Selesai"; harapan: tampilan pindah ke halaman 1, bukan pesan kosong. Catat setiap item yang gagal dan perbaiki sebelum lanjut.

- [ ] **Step 5: Commit.**
```bash
git add frontend/app/bookings/page.tsx frontend/app/globals.css
git commit -m "feat: add bookings page with date, doctor and status filters"
```

---

### Task 4: Alihkan masuk dan bersihkan `/akun`

**Files:**
- Modify: `frontend/lib/config.ts` (`LOGIN_URL = "/login"`; perbarui komentar; hapus `APP_URL` hanya bila tidak ada pemakai lain)
- Modify: `frontend/app/akun/page.tsx` (hapus tombol "Uji bookings", state `testResult`/`testing`, fungsi `testBookings` dan `countOf`; perbarui komentar kepala file)
- Verify: `frontend/app/login/page.tsx` sudah memanggil `router.push("/bookings")` (perubahan ada di working tree, ikut di-commit di sini)

**Interfaces:**
- Consumes: rute `/bookings` dari Task 3.
- Produces: `LOGIN_URL: string` bernilai `"/login"` (dipakai `app/page.tsx` dan `components/Showcase.tsx` tanpa perubahan).

- [ ] **Step 1: Ubah `config.ts` dan `akun/page.tsx`** sesuai daftar di atas. Cek pemakai `APP_URL`: `grep -rn "APP_URL" frontend/app frontend/components frontend/lib`.

- [ ] **Step 2: Verifikasi statis.** Run: `cd frontend && npm run lint && npx tsc --noEmit && npm run build`. Expected: tanpa error dan tanpa peringatan variabel tak terpakai.

- [ ] **Step 3: Verifikasi di browser.** Dari homepage, setiap tombol "Masuk" membuka `/login` Next.js (bukan Laravel); login berhasil mendarat di `/bookings`; `/akun` tidak lagi punya "Uji bookings" tetapi tombol "Keluar" tetap bekerja.

- [ ] **Step 4: Commit.**
```bash
git add frontend/lib/config.ts frontend/app/akun/page.tsx frontend/app/login/page.tsx
git commit -m "feat: route login to bookings and remove akun test button"
```

---

### Task 5: Penutup dokumentasi dan pemeriksaan akhir

**Files:**
- Modify: `docs/TASK_9C_BOOKINGS_PAGE_DESIGN.md` (status → selesai; sesuaikan nama file: `lib/booking.ts`, `lib/booking-api.ts`, `lib/booking.test.ts`; sebut penyimpangan dua file dan script `test`; centang daftar cek yang lulus)

- [ ] **Step 1: Pemeriksaan akhir.** Run: `cd frontend && npm test && npm run lint && npm run build`, lalu `cd .. && php artisan test`. Expected: semua lulus (Laravel tetap 127 hijau); `git status` tidak menampilkan `package-lock.json` root untuk di-stage.

- [ ] **Step 2: Perbarui doc 9C** sesuai daftar di atas.

- [ ] **Step 3: Commit dan push.**
```bash
git add docs/TASK_9C_BOOKINGS_PAGE_DESIGN.md docs/superpowers/plans/2026-11-19-task-9c-bookings-page.md
git commit -m "docs: finalize Task 9c design and plan"
```
Push dan PR hanya setelah pemilik proyek setuju.

---

## Self-Review

- **Cakupan spec:** keputusan 1-4 (tanggal/zona/filter) → Task 1 dan 3; 5-7 (aksi, konfirmasi, muat ulang) → Task 3; 8 (respons usang) → Task 3 + Review Focus 3; 9 (empat keadaan) → Task 3; 10-11 (login, `LOGIN_URL`, `/akun`) → Task 4; 12 (tanpa backend) → Global Constraints. Struktur file spec diperbarui di Task 5.
- **Konsistensi tipe:** `BookingFilters.practitionerId` (string, `""` = semua) dipakai sama di Task 1 (`bookingsPath`), 2 (`fetchBookings`), dan 3 (state). Nama file `lib/booking.ts` konsisten di semua task.
- **Proporsi:** rencana ini hanya memuat tanda tangan, nilai uji, dan keputusan; badan fungsi dan JSX ditulis saat implementasi.
