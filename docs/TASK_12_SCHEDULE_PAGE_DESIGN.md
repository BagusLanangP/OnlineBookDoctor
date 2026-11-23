# Task 12: Halaman Jadwal Praktek di Next.js - Desain

**Hasil akhir:** halaman `/schedules` di shell staf Next.js tempat staf mengatur jam praktek mingguan
tiap dokter (hari aktif atau libur, jam mulai, jam selesai), menyimpan satu minggu sekaligus, dan
langsung diberi tahu bila ada **pasien yang sudah booking di luar jam baru**.
**Bergantung pada:** Task 8 (logika simpan seminggu, `SyncSchedulesRequest`), Task 10 (shell staf),
Task 11 (kelola dokter, komponen `Field`, `Practitioner.specialty` nullable).
**Menggantikan:** halaman Inertia `Schedules/Edit` (dihapus bersama Inertia lain di task berikutnya,
bukan di sini).
**Status:** selesai (disetujui pemilik proyek 2026-11-23: Keputusan 1 = A, Keputusan 2 = A, alamat `/schedules`).

---

## Tujuan dan Kenapa

Booking hanya bisa dibuat pada slot yang dihitung `AvailabilityService` dari **jadwal mingguan dokter**.
Sekarang jadwal hanya bisa diatur di halaman Inertia lama (`localhost:8088/schedules/edit`), jadi staf
yang bekerja di Next.js harus pindah aplikasi, dan dokter baru yang ditambah di `/akun` (Task 11)
belum bisa menerima booking sampai jadwalnya diisi di sana.

Pertanyaan yang dijawab layar ini: **"Dokter ini praktek kapan saja, dan siapa yang terdampak bila
jamnya saya ubah?"**

## Tujuan / Bukan Tujuan / Anti-tujuan

**Tujuan**
- Satu halaman `/schedules`: pilih dokter, 7 baris hari (Senin sampai Minggu), simpan seminggu sekaligus.
- Menu **Jadwal** di sidebar (antara Booking dan Blokir waktu).
- API JSON untuk membaca dan menyimpan jadwal satu dokter, memakai logika Task 8 yang sudah dites.
- Setelah simpan: daftar pasien *confirmed* mendatang yang kini berada di luar jam praktek, dengan
  tombol WhatsApp (pola yang sama dengan Blokir waktu). Booking **tidak** dibatalkan otomatis.
- Bantuan kecil: "Samakan jam ke semua hari aktif", jumlah slot 30 menit per hari, bar pratinjau jam.

**Bukan tujuan** (task berikutnya)
- Lebih dari satu rentang per hari (istirahat siang): butuh perubahan skema (`unique(practitioner_id, day_of_week)`).
- Jadwal khusus per tanggal (cukup pakai Blokir waktu untuk menutup).
- Panjang slot yang bisa diatur (tetap 30 menit, `AvailabilityService::SLOT_MINUTES`).
- Menghapus halaman Inertia `Schedules/Edit` dan rute web-nya.

**Anti-tujuan**
- Mengubah jadwal diam-diam membatalkan atau memindahkan booking pasien.
- Pindah dokter membuang perubahan yang belum disimpan tanpa peringatan.
- Jam tampil dalam zona browser, bukan zona klinik.

---

## Temuan yang Membentuk Desain

1. Tabel `schedules`: `practitioner_id`, `day_of_week` (0 = Minggu ... 6 = Sabtu), `start_time`,
   `end_time` (jam **lokal klinik**, bukan UTC), unik per `(practitioner_id, day_of_week)`.
   Satu rentang per hari.
2. `ScheduleWeekController::update` (Task 8) sudah menyinkronkan seminggu dalam satu transaksi:
   hari yang tidak dikirim = libur (dihapus), hari yang dikirim = `updateOrCreate`. Validasi di
   `SyncSchedulesRequest` (0-6, `distinct`, `H:i`/`H:i:s`, selesai > mulai, maks 7). Ada 16 tes di
   `ScheduleWeekTest`, termasuk "mematikan hari tidak membatalkan booking".
3. Tetapi `update` membalas **redirect** (`back()`) untuk Inertia, dan rutenya hanya di `routes/web.php`.
   Next.js butuh JSON di `/api`.
4. `routes/web.php` juga punya CRUD per baris (`ScheduleController`, Task 4); tidak dipakai di sini.
5. `AvailabilityService` hanya membuat slot yang **muat penuh** sebelum jam selesai (09:00-17:00 →
   slot terakhir 16:30). Rentang di bawah 30 menit sah di server tetapi menghasilkan 0 slot.
6. `Schedule` meng-cast jam ke `datetime:H:i:s`; controller lama memakai `getRawOriginal` + `substr`
   untuk mendapat `"09:00"`.

---

## ⚠️ Keputusan yang Perlu Dikonfirmasi

### 1. Memberi tahu pasien yang terdampak setelah jadwal diubah

| Opsi | Perilaku | Untung / rugi |
|---|---|---|
| **A (usulan)** | Balasan `PUT` memuat pasien *confirmed* **mendatang** yang kini di luar jam praktek (hari libur, sebelum jam mulai, atau slotnya melewati jam selesai). Halaman menampilkan daftar + WhatsApp, seperti Blokir waktu. | Staf langsung tahu siapa yang perlu dikabari; pola sudah dikenal. Perlu hitungan per zona klinik di server. |
| B | Simpan saja, tanpa info pasien. | Paling sederhana; booking "yatim" baru ketahuan saat hari-H. |
| C | Tolak simpan bila ada booking terdampak. | Aman tapi kaku: dokter yang benar-benar berhenti praktek hari Sabtu tidak bisa diatur. |

Dokumen ini memakai **A**. Booking tidak pernah diubah (sesuai Keputusan 6 di Task 8).

### 2. Logika simpan dipakai bersama, bukan disalin

| Opsi | Perilaku | Untung / rugi |
|---|---|---|
| **A (usulan)** | Pindahkan isi `update` ke `ScheduleService::syncWeek()`. Controller Inertia lama dan controller API baru sama-sama memanggilnya. | Satu sumber logika; tes lama tetap menjaga perilaku. |
| B | Controller API menyalin kode transaksi. | Cepat, tapi dua salinan bisa berbeda saat salah satu diubah. |

### 3. Alamat halaman

`/schedules` (bahasa Inggris, sejajar dengan `/bookings` dan `/blocked-times`; label menu tetap
"Jadwal"). Alternatif `/jadwal` mengikuti `/akun`. Usulan: **`/schedules`**.

---

## Backend

### Service `app/Services/ScheduleService.php`

```php
/** @return array<int, array{day_of_week:int, start_time:string, end_time:string}>  urut 0..6, "HH:mm" */
public function week(Practitioner $p): array;

/** Isi dipindah dari ScheduleWeekController::update (transaksi, hapus hari yang tidak dikirim, updateOrCreate). */
public function syncWeek(Practitioner $p, array $days): void;

/**
 * Booking confirmed mendatang (booked_time > now) milik dokter ini yang tidak lagi muat di jadwal:
 * hari lokalnya libur, jam lokal < start_time, atau jam lokal + 30 menit > end_time.
 * Dihitung dalam zona klinik. Mengembalikan [count, daftar maks 50 urut waktu].
 */
public function outsideBookings(Practitioner $p): array;
```

`ScheduleWeekController::update` diubah memanggil `syncWeek()`; perilaku dan tes lama tidak berubah.

### Endpoint (di `routes/api.php`, grup `auth:sanctum` + `has.clinic`)

```
GET  /api/practitioners/{practitioner}/schedules    jadwal mingguan satu dokter
PUT  /api/practitioners/{practitioner}/schedules    simpan seminggu (hari yang tidak dikirim = libur)
```

Controller baru `App\Http\Controllers\Api\ScheduleController` (`show`, `update`). `update` memakai
`SyncSchedulesRequest` apa adanya (otorisasi dokter se-klinik sudah ada di sana → 403).

`GET` membalas:
```json
{ "practitioner_id": 3, "schedules": [ { "day_of_week": 1, "start_time": "09:00", "end_time": "17:00" } ] }
```

`PUT` membalas bentuk yang sama, ditambah:
```json
{ "outside_bookings": 2,
  "outside": [ { "id": 41, "patient_name": "Budi", "patient_phone": "6281…", "booked_time": "2026-11-29T02:00:00Z" } ] }
```
(`booked_time` UTC ISO, sama dengan respons Blokir waktu, supaya `whenLabel`/`waLink` bisa dipakai ulang.)

### Tes (PHPUnit)
- `ScheduleApiTest`: tanpa login 401; tanpa klinik 403; dokter klinik lain 403 (GET dan PUT);
  GET mengembalikan `"HH:mm"` urut hari; PUT menyinkronkan (ubah, hapus, tambah) dan membalas jadwal baru;
  `[]` = libur seminggu; 422 untuk selesai ≤ mulai, hari ganda, hari di luar 0-6.
- `outside_bookings`: booking di hari yang dimatikan terhitung; booking sebelum jam mulai / slot
  melewati jam selesai terhitung; booking di dalam jam tidak; booking lampau, *completed*, dan
  *cancelled* tidak; dihitung dalam zona klinik (mis. WITA); booking tetap *confirmed* setelah simpan.
- `ScheduleWeekTest` lama tetap lulus tanpa diubah (bukti refactor aman).

---

## Frontend

### Berkas
```
frontend/app/(staff)/schedules/page.tsx   halaman
frontend/lib/schedule.ts                  tipe + fungsi murni, dites
frontend/lib/schedule.test.ts
frontend/lib/schedule-api.ts              fetchWeek, saveWeek
frontend/components/Sidebar.tsx           + menu "Jadwal" (ikon jam, garis 16px)
frontend/app/globals.css                  gaya baris hari dan bar jam
```

### Susunan halaman

```
Jadwal praktek                                      [Dr. Ahmad Wijaya ▾]
Jam praktek mingguan. Jam mengikuti zona waktu klinik (WITA).

┌ Senin    [✓] [09:00]–[17:00]  16 slot   ░░░░████████████░░░░ ┐
│ Selasa   [✓] [09:00]–[17:00]  16 slot   ░░░░████████████░░░░ │
│ Rabu     [ ] Libur                       ░░░░░░░░░░░░░░░░░░░░ │
│ …                                                             │
│ Minggu   [ ] Libur                                            │
└───────────────────────────────────────────────────────────────┘
[Simpan jadwal]  Samakan jam Senin ke semua hari aktif     Tersimpan

┌ Jadwal disimpan. 2 pasien sudah booking di luar jam baru. ──┐
│ Budi Santoso   Sab 29 Nov, 10.00          [WhatsApp]          │
└───────────────────────────────────────────────────────────────┘
```

- Urutan hari **Senin sampai Minggu** (kebiasaan Indonesia); dikirim sebagai `day_of_week` 1..6, 0.
- Baris hari: kotak centang "aktif" (label = nama hari), dua `input type="time"` (`step=1800`, tidak
  memaksa), jumlah slot, bar 00-24 (hiasan, `aria-hidden`). Hari libur: input disembunyikan, teks "Libur".
- Panel batu `#f3f3f1` radius 12 seperti form Blokir waktu; satu tombol utama gelap "Simpan jadwal"
  (nonaktif bila tidak ada perubahan), cap "Tersimpan" setelah berhasil.
- **Samakan jam:** menyalin jam hari aktif pertama ke semua hari aktif lain (tidak menyalakan hari libur).
- **Pindah dokter dengan perubahan belum disimpan:** konfirmasi di baris judul, dua langkah
  ("Buang perubahan?" Ya / Tidak), pola sama dengan hapus di Blokir waktu.
- **Panel hasil simpan** (`role="status"`, selalu ada di DOM): "Tidak ada booking yang terdampak" atau
  daftar pasien + WhatsApp (`waLink`, pesan siap kirim tentang perubahan jadwal), "dan N lainnya" bila
  lebih dari 50, tautan ke `/bookings`.
- ≥ 1180px: panel jadwal maks ~760px + panel hasil di kanan (pola `bk__blockgrid`). < 1180px: bertumpuk.
  ≤ 640px: baris hari jadi dua tingkat (nama + centang di atas, jam di bawah), bar disembunyikan,
  target sentuh 44px, tanpa scroll horizontal.
- Keadaan: memuat (kerangka 7 baris), error dengan "Coba lagi", 401 → `/login`, klinik tanpa dokter →
  "Klinik ini belum punya dokter." + tautan ke `/akun`, 422 → pesan di baris hari yang salah
  (`errors["schedules.2.end_time"]` dipetakan ke baris ke-3 yang dikirim), 403 → pesan jelas.

### Fungsi murni (`lib/schedule.ts`, dites)
- `DAYS` (urutan Senin..Minggu, `dow`, label), `DEFAULT_HOURS` (09:00-17:00).
- `buildWeek(rows)` → 7 baris form; `toPayload(week)` → hanya hari aktif, `day_of_week` + `HH:mm`.
- `validateDay(day)` (selesai > mulai; format) dan `slotCount(day)` (sama dengan aturan "muat penuh"
  di `AvailabilityService`; 0 slot = peringatan "Tidak ada slot 30 menit", bukan error).
- `isWeekDirty(saved, week)`, `copyHoursToActive(week, fromDow)`.
- `rowErrorsFrom422(body, payload)` → pesan per hari.
- `scheduleChangeMessage(booking, clinicName, tz)` untuk WhatsApp.

---

## Daftar Cek Manual (Laravel asli)
- Atur Senin-Jumat 09:00-17:00 → muat ulang → nilai tetap; halaman Inertia lama menampilkan hal yang sama.
- Matikan hari yang punya booking *confirmed* mendatang → panel menyebut pasiennya; di `/bookings`
  booking tetap *confirmed*.
- Majukan jam selesai sehingga satu booking terlewati → terhitung; booking di dalam jam tidak.
- Ganti zona klinik ke WITA (di `/akun`) → hitungan terdampak mengikuti jam WITA.
- Ubah jadwal, pilih dokter lain → diminta konfirmasi; "Tidak" mempertahankan perubahan.
- 390px: tanpa scroll horizontal; keyboard: Tab melewati centang dan jam per hari, fokus terlihat.

## Kriteria Selesai
- [x] `ScheduleService`, 2 endpoint, dan tes backend lulus (172 tes, 13 baru di `ScheduleApiTest`);
      `ScheduleWeekTest` lama lulus tanpa diubah.
- [x] `/schedules` di shell staf, menu "Jadwal" aktif di sidebar.
- [x] Pasien terdampak tampil setelah simpan; booking tidak berubah.
- [x] `npm test` (54 tes), lint, `tsc`, build bersih; inspector taste-skill `--app` 0 FAIL di 1440/768/390.
      Satu WARN `hero-void` (ruang di bawah panel kanan) dibiarkan: kolom itu tempat hasil simpan,
      pola yang sama dengan Blokir waktu. `font-not-dealt` diabaikan seperti Task 11.

## Catatan Pembangunan
- `ScheduleWeekController::update` (Inertia) sekarang memanggil `ScheduleService::syncWeek()`.
- Baris hari memakai kolom grid tetap (`112px 248px 64px 1fr`): tiap baris adalah grid sendiri, jadi
  kolom `auto` membuat bar 00-24 tidak sejajar antara hari aktif dan libur.
- Sebelum ada hasil simpan, kolom kanan berisi keterangan (apa yang akan muncul + tautan Blokir waktu).
- Interaksi diuji di Chrome headless dengan API tiruan: simpan nonaktif tanpa perubahan, error per
  hari, samakan jam, konfirmasi pindah dokter, panel terdampak + WhatsApp, peringatan 0 slot.
  Daftar Cek Manual dengan Laravel asli belum dijalankan.

## Diserahkan ke Pembangun
Nama komponen internal, teks kerangka, isi pesan WhatsApp dan pesan error (berbahasa Indonesia dan
menyebut harinya), serta ikon menu selama mengikuti gaya ikon garis yang ada.
