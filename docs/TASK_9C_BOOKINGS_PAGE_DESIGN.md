# Task 9c: Halaman Daftar Booking di Next.js

**Deliverable:** Halaman `/bookings` di Next.js (`localhost:3000`). Staf klinik yang sudah login melihat booking satu hari (default: hari ini menurut zona waktu klinik), bisa menyaring berdasarkan dokter dan status, lalu menandai booking "Selesai" atau "Batal". Link "Masuk" di homepage menuju `/login` Next.js, dan tombol "Uji bookings" di `/akun` dihapus.
**Dependencies:** Task 9a (login Sanctum SPA, `lib/api.ts`), Task 9b (`GET /api/bookings?date`, `GET /api/practitioners`), Task 5 (`PUT` dan `DELETE /api/bookings/{id}`).
**Estimasi:** 3-4 jam (satu halaman, satu file helper, dua perubahan kecil, tanpa perubahan backend).
**Status:** selesai (2026-11-19). Bagian 1-3 (helper, pemanggil API, halaman) masuk lewat PR #17; bagian 4-5 (login, `/akun`, `LOGIN_URL`, dokumen ini) lewat PR berikutnya. Perbedaan dari rancangan awal dicatat di "Perubahan saat implementasi". Pilihan yang saya putuskan sendiri (bukan hasil diskusi) ditandai **[keputusan saya]**.

---

## Sketch

```
/bookings                                              Klinik Maju Jaya · Akun
─────────────────────────────────────────────────────────────────────────────
Booking                         [◀]  [ 2026-11-18 ]  [▶]   [Hari ini]

Dokter [ Semua dokter ▾ ]   Status [ Semua ▾ ]              3 booking
─────────────────────────────────────────────────────────────────────────────
JAM    PASIEN             DOKTER              ALASAN      STATUS     AKSI
07.00  Budi Santoso       Dr. Ahmad Wijaya    Checkup     Terkonfirmasi  [Selesai] [Batal]
12.00  Siti Rahma         Dr. Siti Nurhaliza  Follow-up   Selesai
23.59  Rudi Hermawan      Dr. Ahmad Wijaya    Konsultasi  Dibatalkan
─────────────────────────────────────────────────────────────────────────────
                                       [◀ Sebelumnya]  Hal 1 dari 1  [Berikutnya ▶]
```

Di layar sempit (≤ 640px) setiap baris menjadi kartu bertumpuk: jam dan status di atas, nama pasien, lalu dokter dan alasan, lalu tombol aksi. Di tablet (641-1023px) kolom alasan disembunyikan dan alasan tampil di bawah nama dokter.

Alur data saat halaman dibuka:

```
/bookings terbuka
   │ GET /api/user ───────────▶ clinic.timezone  (401 → /login, clinic null → pesan)
   │ GET /api/practitioners ──▶ isi dropdown dokter
   ▼
tanggal awal = hari ini menurut clinic.timezone
   │ GET /api/bookings?date=…&status=…&practitioner_id=…&page=…
   ▼
tabel  ──  [Selesai] PUT {status:completed}   [Batal] DELETE  ──▶ muat ulang daftar
```

---

## Fakta dari kode (sudah diperiksa)

Tabel ini menggambarkan keadaan **sebelum** task dikerjakan.

| Hal | Kondisi |
|---|---|
| Pola halaman yang ada | `app/akun/page.tsx` dan `app/login/page.tsx`: `"use client"`, `useEffect` memanggil `api()`, flag `alive` untuk membatalkan hasil setelah unmount, 401 → `router.replace("/login")`. Tanpa library data fetching |
| `lib/api.ts` | `api<T>(path, init)` menambahkan prefix `/api`, `credentials: "include"`, dan `X-XSRF-TOKEN` untuk non-GET. Respons 204 mengembalikan `undefined`. Error dilempar sebagai `ApiError(status, body)` |
| `GET /api/user` | `{ user: {id,name,email}, clinic: {id,name,timezone} \| null }`. Halaman `/akun` sudah memakai tipe `Me` ini |
| `GET /api/bookings` | Paginator Laravel (20 per halaman): `data[]`, `current_page`, `last_page`, `total`, `next_page_url`, `prev_page_url`. Tiap booking memuat `practitioner: {id, name}`. Kolom booking menurut migrasi: `patient_name`, `patient_phone`, `visit_reason`, `booked_time` (ISO UTC), `status` |
| `PUT /api/bookings/{id}` | Body `{ "status": "completed" \| "cancelled" }`, membalas booking yang diperbarui. 403 bila booking milik klinik lain |
| `DELETE /api/bookings/{id}` | `BookingService::cancel` hanya menandai `cancelled`, data tidak dihapus. Membalas 204 |
| Dua jalur batal | `PUT` dengan `cancelled` dan `DELETE` menghasilkan akibat yang sama |
| `lib/config.ts` | `LOGIN_URL = ${APP_URL}/login` (Laravel). Dipakai di `app/page.tsx` (4 tempat) dan `components/Showcase.tsx` (1 tempat) |
| Gaya | Token di `globals.css`: `--paper`, `--ink`, `--muted`, `--accent`, `--accent-soft`, `--margin`, `--step-small/body/lead`. Kelas `.btn`, `.btn--ink`, `.btn--tone`. Belum ada gaya tabel, dropdown, atau input tanggal |
| Pengujian frontend | `package.json` tidak punya test runner. Hanya `lint` dan `build` |
| Next.js | `next 16.4.6`. `frontend/AGENTS.md` mewajibkan membaca `node_modules/next/dist/docs/` sebelum menulis kode |

Dicek di Langkah 0: bentuk JSON satu booking adalah `{id, practitioner_id, patient_name, patient_phone, visit_reason, booked_time, status, practitioner: {id, name}}`. Nama dokter ada di objek `practitioner`, bukan field `practitioner_name`.

---

## Approaches

Tiga cara membangun halaman ini, dan satu yang saya pilih. **[keputusan saya]** karena pilihan ini tidak sempat kita bahas.

1. **Satu halaman klien dengan `useEffect` + `api()`, filter di state komponen (dipilih).** Sama persis dengan pola `/akun` dan `/login`, tanpa dependensi baru, mudah dipelajari. Kekurangannya: filter hilang saat halaman dimuat ulang, dan tidak ada cache antar-navigasi.
2. **Filter disimpan di URL (`?date=…&status=…`) lewat `useSearchParams`.** Halaman bisa di-bookmark dan tombol "kembali" bekerja. Kekurangannya: `useSearchParams` di Next 16 menuntut `Suspense` dan perilaku render yang belum saya baca di dokumennya, jadi risikonya lebih besar untuk manfaat yang belum dibutuhkan. Bisa ditambah di task berikutnya tanpa merombak halaman.
3. **Library data fetching (SWR / TanStack Query).** Cache dan refetch otomatis, tetapi menambah dependensi dan konsep baru untuk satu halaman. Tidak sebanding sekarang.

---

## Keputusan

### 1. Halaman satu hari, bukan semua booking
Pembukaan halaman menampilkan **hari ini menurut zona waktu klinik**. Backend sengaja tanpa default tanggal (keputusan 2 di doc 9b), jadi Next.js yang mengirim `date` hari ini. Resepsionis paling sering butuh "siapa yang datang hari ini". **[keputusan saya]**

### 2. Tanggal "hari ini" dihitung dengan zona waktu klinik, bukan zona browser
```ts
new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()) // "2026-11-18"
```
Bila browser staf berada di zona lain dari klinik, "hari ini" tetap hari klinik. Tombol ◀ ▶ menggeser tanggal sebagai teks `YYYY-MM-DD` (lewat `Date.UTC`), jadi tidak terkena pergeseran zona waktu atau DST.

### 3. Jam ditampilkan dengan `Intl.DateTimeFormat` memakai zona klinik
`booked_time` datang sebagai ISO UTC (keputusan 10 di doc 9b). Format: `Intl.DateTimeFormat("id-ID", { timeZone: tz, hour: "2-digit", minute: "2-digit" })`. Booking pukul `2026-11-17T17:00:00Z` tampil sebagai `00.00` di klinik Jakarta, dan masuk ke daftar tanggal 18, konsisten dengan filter backend.

### 4. Dua filter: dokter dan status, keduanya "Semua" secara default
Dropdown dokter diisi dari `/api/practitioners`. Dropdown status berisi tetap: Semua, Terkonfirmasi (`confirmed`), Selesai (`completed`), Dibatalkan (`cancelled`). Mengubah filter apa pun mengembalikan ke halaman 1.

### 5. Aksi hanya muncul pada booking `confirmed`
"Selesai" memanggil `PUT {status:"completed"}`. "Batal" memanggil `DELETE`, sesuai rancangan 9b (jalur yang memang dibuat untuk batal). Booking yang sudah selesai atau dibatalkan tidak punya tombol, jadi tidak ada transisi aneh antar-status. **[keputusan saya]**

### 6. "Batal" butuh konfirmasi dua langkah di dalam baris
Klik "Batal" mengubah tombol menjadi "Yakin batal?" dengan tombol "Ya, batalkan" dan "Tidak". Pembatalan memengaruhi pasien, jadi tidak boleh terjadi dari satu klik tidak sengaja. Tanpa `window.confirm` karena gayanya tidak bisa diatur dan sering diblokir. "Selesai" tidak perlu konfirmasi. **[keputusan saya]**

### 7. Setelah aksi berhasil, daftar dimuat ulang
Bukan mengubah baris di state. Dengan filter status aktif, baris bisa keluar dari daftar setelah statusnya berubah, dan muat ulang menangani itu otomatis. Selama aksi berjalan, tombol baris itu dinonaktifkan agar tidak terkirim dua kali.

### 8. Respons usang diabaikan
Mengganti tanggal dengan cepat bisa membuat respons lama tiba setelah respons baru. Setiap pemuatan memakai penanda urutan, dan hanya hasil terbaru yang dipakai (pola `alive` di `/akun`, diperluas per permintaan).

### 9. Empat keadaan yang selalu ditangani
- **Memuat:** teks "Memuat…" dengan `aria-live="polite"`.
- **Kosong:** "Tidak ada booking pada tanggal ini."
- **Error umum:** pesan dengan `role="alert"` dan tombol "Coba lagi".
- **401:** `router.replace("/login")`. **403 / `clinic: null`:** "Akun ini belum terhubung ke klinik."

### 10. Setelah login, masuk ke `/bookings`
`/login` mengarahkan ke `/bookings` (bukan `/akun`). `/akun` tetap ada untuk profil dan tombol Keluar, dan tombol "Uji bookings" beserta fungsi `countOf` dihapus (sudah disebut sementara di komentar 9a). Header `/bookings` memuat nama klinik dan tautan "Akun".

### 11. Link "Masuk" di homepage menuju `/login` Next.js
Cukup mengubah `LOGIN_URL` di `lib/config.ts` menjadi `"/login"`. Lima pemakai (`page.tsx`, `Showcase.tsx`) ikut berubah tanpa disentuh. `APP_URL` tetap diekspor bila masih dipakai di tempat lain (dicek saat implementasi), dan komentar di file itu diperbarui.

### 12. Tanpa perubahan backend
Semua endpoint yang dibutuhkan sudah ada. Bila Langkah 0 menemukan field respons yang kurang, itu dicatat dan diputuskan terpisah, bukan diubah diam-diam.

---

## Perubahan saat implementasi

Hal yang berbeda dari rancangan di atas, beserta alasannya.

| Hal | Rancangan | Hasil akhir | Alasan |
|---|---|---|---|
| File helper | Satu file `lib/bookings.ts` | Dua file: `lib/booking.ts` (tipe dan fungsi murni, tanpa import) dan `lib/booking-api.ts` (pemanggil API) | Fungsi murni bisa dites dengan `node --test` tanpa ikut memuat `lib/api.ts` dan `fetch` |
| Nama fungsi jam | `formatTime(iso, tz)` | `formatDate(iso, tz)`, mengembalikan `"-"` untuk ISO rusak | Nama dipilih saat menulis file; perilakunya sama dengan rancangan |
| Test runner | Tidak ada | `npm test` menjalankan `node --test lib/*.test.ts` (5 tes). `tsconfig.json` mendapat `allowImportingTsExtensions` agar tes bisa mengimpor `./booking.ts` | Node 26 menjalankan `.ts` langsung, jadi tidak perlu dependensi baru |
| Filter status | Dropdown | Tab (`aria-pressed`) di atas tabel | Empat pilihan tetap lebih cepat diklik satu kali |
| Keadaan memuat | Teks "Memuat…" | Baris kerangka (skeleton) saat pertama kali; saat ganti filter, data lama tetap tampil redup sampai data baru tiba | Tabel tidak melompat setiap ganti tanggal |
| Respons usang | Penanda urutan | Kunci permintaan (`JSON.stringify(filters) + reloadKey`) dibandingkan dengan kunci hasil, ditambah flag `alive` di pembersih `useEffect` | Aturan React 19: tidak boleh `setState` langsung di dalam effect |
| Klik ganda | Tombol dinonaktifkan | Tombol dinonaktifkan dan `useRef` sebagai penjaga | Ref berubah seketika, state baru berlaku setelah render ulang |
| Halaman kosong setelah aksi | Tidak dibahas | Bila halaman > 1 kosong setelah muat ulang, mundur satu halaman | Membatalkan booking terakhir di halaman 2 tidak meninggalkan halaman kosong |
| Tambahan | - | Penanda "Berikutnya" pada booking terkonfirmasi terdekat (hanya hari ini), ringkasan jumlah per status di bawah judul | Menjawab "siapa pasien selanjutnya" tanpa membaca seluruh tabel |
| Tampilan | Memakai token yang ada | Gaya "bingkai dan lembar": bingkai berwarna `--paper`, lembar putih dengan garis 1px, judul 24px, header tabel 12px abu-abu, pil status pucat, tanpa bayangan. Semua kelas berawalan `bk__` di akhir `globals.css` | Dua putaran masukan: versi awal terasa lepas-lepas dan kurang modern |
| `APP_URL` | Tetap bila masih dipakai | Dihapus, beserta `NEXT_PUBLIC_APP_URL` di `.env.example` dan README | Setelah `LOGIN_URL = "/login"`, tidak ada pemakai lain |
| `/akun` | Hapus "Uji bookings" | Dihapus, diganti tautan "Lihat booking" (hanya bila akun punya klinik) | Halaman akun tidak menjadi jalan buntu |

---

## Struktur File

```
frontend/app/bookings/page.tsx     (baru: halaman, filter, tabel, aksi; berkomentar penjelasan)
frontend/lib/booking.ts            (baru: tipe Booking/Practitioner/Paginated/BookingFilters, STATUS_LABEL,
                                    todayIn(), shiftDate(), formatDate(), bookingsPath())
frontend/lib/booking-api.ts        (baru: fetchBookings, fetchPractitioners, markCompleted, cancelBooking)
frontend/lib/booking.test.ts       (baru: 5 tes node:test)
frontend/app/globals.css           (ubah: blok gaya bk__* untuk halaman booking)
frontend/package.json              (ubah: script "test")
frontend/tsconfig.json             (ubah: allowImportingTsExtensions)
frontend/app/login/page.tsx        (ubah: router.push("/bookings"))
frontend/app/akun/page.tsx         (ubah: hapus "Uji bookings" dan countOf, tambah tautan ke /bookings)
frontend/lib/config.ts             (ubah: LOGIN_URL = "/login", APP_URL dihapus)
frontend/.env.example, README.md   (ubah: hapus NEXT_PUBLIC_APP_URL, perbarui tabel struktur)
```

Tidak ada dependensi baru. Tidak ada perubahan di Laravel.

---

## Langkah

**Langkah 0: Persiapan.**
- Baca panduan di `frontend/node_modules/next/dist/docs/` yang relevan (client component, navigasi, `Link`) sebelum menulis kode, sesuai `AGENTS.md`.
- Login, lalu `curl` ke `/api/bookings?date=…` dan `/api/practitioners` untuk memastikan nama field respons. Sesuaikan tipe di `lib/bookings.ts` dengan hasilnya.
- Cek `git diff --stat package-lock.json` di root: perubahan 55 baris yang muncul sejak awal sesi bukan bagian task ini, jangan ikut di-commit.

**Langkah 1: `lib/bookings.ts`.** Tipe dan tiga fungsi murni: `todayIn(tz)`, `shiftDate(date, days)`, `formatTime(iso, tz)`. Fungsi murni mudah dicoba lewat konsol tanpa menjalankan halaman.

**Langkah 2: Halaman `/bookings`.** Urutan: muat `/api/user` dan `/api/practitioners`, hitung tanggal awal, muat booking, render tabel, lalu aksi Selesai dan Batal. Gaya di `globals.css` memakai token yang sudah ada.

**Langkah 3: Perubahan kecil.** `login` ke `/bookings`, hapus tombol uji di `/akun`, `LOGIN_URL` ke `/login`.

**Langkah 4: Verifikasi.** `npm run lint`, `npm run build`, lalu daftar manual di bawah.

---

## Daftar Cek (manual)

Fungsi tanggal, jam, dan alamat API dites otomatis lewat `npm test`. Sisanya dicoba langsung di browser. Siapkan data seperti panduan 9B (booking di batas tengah malam, dua dokter).

Tanda `[x]` berarti sudah diperiksa saat implementasi: lewat tes otomatis, lewat `curl` ke API Laravel asli, atau di browser dengan API tiruan (harness pratinjau, lebar 1440/768/390px). Item yang masih `[ ]` perlu dicoba manual dengan data Laravel asli.

**Akses**
- [x] Belum login, buka `/bookings`: dialihkan ke `/login`. (API membalas 401 tanpa sesi; halaman mengalihkan pada 401)
- [ ] Login: masuk ke `/bookings`, bukan `/akun`.
- [ ] Akun tanpa klinik: pesan "belum terhubung ke klinik", bukan layar kosong atau error.
- [ ] Klik "Masuk" di homepage: membuka `/login` Next.js (bukan Laravel).

**Tanggal dan zona waktu**
- [ ] Halaman terbuka pada tanggal hari ini menurut klinik. Uji juga dengan mengubah zona waktu sistem browser: tanggal awal tetap hari klinik. (`todayIn` dites otomatis)
- [x] ◀ ▶ menggeser satu hari, melewati akhir bulan (`2026-11-30` → `2026-12-01`) dan akhir tahun dengan benar. (`shiftDate`, termasuk tahun kabisat)
- [ ] "Hari ini" kembali ke hari ini.
- [x] Booking `2026-11-17T17:00:00Z` muncul di tanggal 18 dengan jam `00.00`; booking `2026-11-18T17:00:00Z` muncul di tanggal 19. (`formatDate` dites; API asli mengembalikan booking `2026-11-18T17:00:00Z` untuk `date=2026-11-19`)
- [ ] Ubah `clinics.timezone` ke `Asia/Makassar`: jam bergeser satu jam dan daftar mengikuti.

**Filter**
- [ ] Dropdown dokter berisi dokter klinik sendiri, urut nama.
- [ ] Filter dokter, filter status, dan keduanya bersamaan menghasilkan irisan yang benar.
- [ ] Mengubah filter saat di halaman 2 mengembalikan ke halaman 1.
- [ ] Lebih dari 20 booking: tombol Berikutnya/Sebelumnya bekerja dan filter tetap berlaku di halaman 2.

**Aksi**
- [ ] "Selesai" mengubah status; baris tetap tampil bila filter "Semua", hilang bila filter "Terkonfirmasi".
- [ ] "Batal" meminta konfirmasi; "Tidak" membatalkan konfirmasi tanpa mengubah apa pun.
- [ ] "Ya, batalkan" mengubah status menjadi Dibatalkan.
- [ ] Booking selesai/dibatalkan tidak punya tombol aksi.
- [ ] Klik cepat dua kali pada "Selesai": hanya satu permintaan terkirim (cek tab Network).
- [ ] Sesi dihapus di tab lain lalu klik aksi: dialihkan ke `/login`.

**Keadaan dan tampilan**
- [ ] Tanggal tanpa booking: pesan kosong. (API asli membalas `total: 0` untuk tanggal kosong)
- [ ] Matikan Laravel: pesan error dengan tombol "Coba lagi"; hidupkan lagi, tombol itu memulihkan halaman.
- [ ] Ganti tanggal berkali-kali dengan cepat: tampilan akhir sesuai tanggal terakhir yang dipilih.
- [x] Lebar 375px: tampil sebagai kartu, tanpa scroll horizontal. (diperiksa di 390px dengan API tiruan)
- [ ] Dengan keyboard saja: semua filter dan tombol bisa dijangkau dan fokusnya terlihat.

```bash
cd frontend && npm test && npm run lint && npx tsc --noEmit && npm run build
```

---

## Kriteria Selesai

- [x] `/bookings` menampilkan booking satu hari menurut zona waktu klinik, dengan filter dokter dan status serta paginasi.
- [x] "Selesai" dan "Batal" bekerja, dengan konfirmasi untuk "Batal". (dicoba dengan API tiruan; belum dengan data asli)
- [x] Login dan link "Masuk" homepage memakai halaman Next.js; tombol "Uji bookings" sudah tidak ada.
- [ ] Semua item daftar cek di atas lulus. (sisa item manual di atas)
- [x] `npm test`, `npm run lint`, `tsc`, dan `npm run build` bersih.
- [x] Tidak ada perubahan di folder Laravel, dan `package-lock.json` root tidak ikut ter-commit.

---

## Yang TIDAK Dikerjakan Task Ini

- Filter di URL (bisa di-bookmark) dan menyimpan filter antar-muat ulang.
- Membuat booking baru dari halaman ini (`POST /api/bookings`).
- Pencarian nama atau nomor telepon pasien, filter rentang tanggal, ukuran halaman yang bisa diatur.
- Tautan WhatsApp ke pasien.
- Tombol Keluar di halaman booking (tetap di `/akun`).
- Library data fetching atau pustaka komponen. (Test runner ternyata ditambahkan, lihat "Perubahan saat implementasi".)
- Pembaruan otomatis (polling) daftar.
- Mengubah backend atau format respons.

---

## Langkah Berikutnya

Menurut `docs/PHASE_2_DETAILED_PLAN.md`, berikutnya Task 10 (halaman Blocked Times), lalu Task 11 (Pengaturan), Task 12 (layout dan navigasi bersama; `Shell` di halaman booking bisa menjadi dasarnya), dan Task 13 (tes dan polish). Rencana itu masih menyebut path Inertia (`resources/js/Pages/...`); halaman baru dibuat di `frontend/app/...`. Kandidat lain dari daftar "tidak dikerjakan": form booking baru dan filter di URL.
