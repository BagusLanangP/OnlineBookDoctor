# Task 10: Halaman Blocked Times (Next.js) - Desain

**Hasil akhir:** halaman `/blocked-times` tempat staf klinik memblokir waktu seorang dokter (cuti berhari-hari, atau sebagian hari seperti "17.00-19.00 tidak bisa"), melihat dan menghapus blokir, dan, bila ada pasien yang sudah booking di waktu itu, langsung menghubungi mereka lewat WhatsApp.
**Bergantung pada:** Task 6 (API blocked-times di `routes/web.php`), Task 9a (login Sanctum + `api()`), Task 9c (pola halaman, helper tanggal, `Shell`).
**Status:** desain, menunggu persetujuan.

---

## Tujuan dan Kenapa

Dokter kadang tidak bisa praktek di sebagian jadwalnya. Dua bentuk yang disebut pemilik proyek:

1. **Cuti / libur:** satu atau beberapa hari penuh.
2. **Sebagian hari:** dokter praktek 14.00-22.00, tetapi 17.00-19.00 tidak bisa. Bisa lebih dari satu blokir di hari yang sama (misalnya tambahan 15.00-16.00).

Slot yang diblokir harus hilang dari ketersediaan (sudah dikerjakan `AvailabilityService`, Task 3). Yang kurang adalah halaman untuk mengaturnya, dan jalan keluar bagi pasien yang terlanjur booking.

## Tujuan / Bukan Tujuan / Anti-tujuan

**Tujuan**
- Buat blokir: dokter, tanggal mulai-selesai, jam mulai-selesai atau "Seharian", alasan.
- Daftar blokir mendatang per dokter, urut waktu, dengan "Hapus" (konfirmasi dua langkah di dalam baris, seperti "Batal" di `/bookings`).
- Setelah simpan, bila ada booking aktif yang bentrok: tampilkan daftar pasien dengan tombol WhatsApp.
- Semua jam di layar memakai zona waktu klinik (`clinic.timezone`), bukan zona browser.

**Bukan tujuan** (tidak dikerjakan di task ini)
- Mengubah/mengedit blokir (hapus lalu buat ulang, keputusan Task 6).
- Pratinjau bentrok sebelum simpan.
- Membatalkan booking bentrok dari halaman ini (staf memakai `/bookings`).
- Mengirim pesan WhatsApp otomatis atau menyimpan riwayat "sudah dihubungi" (Phase 3).
- Melihat jadwal praktek dokter di form (API schedule belum ada di `/api`).
- Daftar blokir semua dokter sekaligus, filter di URL, riwayat blokir yang sudah lewat.

**Anti-tujuan** (dianggap gagal walau secara teknis jalan)
- Booking pasien dibatalkan otomatis tanpa keputusan staf.
- Blokir "10 Nov" meleset 7 jam karena zona waktu tertukar.
- Staf mengira blokir sudah menolak booking lama, padahal hanya memblokir booking baru.

## Keputusan Pemilik Proyek

- Blokir sebagian hari dan cuti panjang sama-sama didukung; beberapa blokir di hari yang sama boleh.
- Pasien yang sudah booking tidak dibatalkan otomatis. Menghubungi pasien adalah **opsi**, bukan paksaan.
- Cara mendapat data pasien bentrok: **pendekatan A**, backend ikut mengirim daftar di respons simpan.

## Pendekatan yang Dipertimbangkan

| | Cara | Untung | Rugi |
|---|---|---|---|
| **A (dipilih)** | `POST` mengembalikan juga `conflicts` (daftar pasien) | Satu permintaan; aturan "bentrok" tetap di server dan sudah dites (Task 6) | Tambahan kecil di controller dan tes; daftar perlu dibatasi |
| B | Frontend memanggil `/api/bookings` per tanggal lalu menyaring | Backend tidak berubah | Cuti 7 hari = 7+ permintaan dan paginasi; logika zona waktu ganda di frontend |
| C | Endpoint pratinjau sebelum simpan | UX paling aman | Terbanyak kerjanya; belum perlu untuk kasus ini |

---

## Temuan yang Membentuk Desain

1. **Rute blocked-times belum ada di `/api`.** Hanya di `routes/web.php` (middleware `auth` + `verified`, sesi Inertia). `GET /api/practitioners/1/blocked-times` membalas 404. Task ini menambah 3 rute di `routes/api.php`, di grup `auth:sanctum` + `has.clinic`, menunjuk ke `BlockedTimeController` yang sama (pola yang sama dengan `BookingController`, yang sudah dipakai di web dan api). Ini membuat task ini **menyentuh folder Laravel**, berbeda dengan 9c.
2. **API membaca waktu sebagai UTC.** `Carbon::parse($v, 'UTC')`; nilai dengan offset (`+07:00`) dihormati. UI harus mengubah "tanggal + jam klinik" menjadi UTC lewat satu helper (lihat bawah).
3. **Respons `POST` saat ini** hanya `conflicting_bookings` (jumlah). Booking dianggap bentrok bila `booked_time` berada di `[start, end)` dan `Booking::active()`. Perhatikan: `active()` hanya menyingkirkan `cancelled`, jadi booking `completed` ikut terhitung. Untuk daftar yang akan dihubungi lewat WhatsApp itu tidak masuk akal.
4. **`GET` mengembalikan paginator** (20/halaman), `?upcoming=1` menyaring blokir yang `end_time`-nya belum lewat. Rute ini per dokter.
5. **`DELETE` mengembalikan 204**; `api()` sudah menangani 204.
6. **Akun uji:** `admin@klinikmajujaya.test` / `password` (klinik "Klinik Maju Jaya", `Asia/Jakarta`). `test@example.com` tidak punya klinik. Database sudah punya satu blokir contoh (26 Nov - 2 Des, "Annual Leave", dokter 1).

---

## Perubahan Backend

### 1. Tiga rute di `routes/api.php`
Di dalam grup `Route::middleware('has.clinic')`:

```
GET    /api/practitioners/{practitioner}/blocked-times   BlockedTimeController@index
POST   /api/practitioners/{practitioner}/blocked-times   BlockedTimeController@store
DELETE /api/blocked-times/{blockedTime}                  BlockedTimeController@destroy
```

Rute web tetap ada (tidak dihapus). Perilaku 403 untuk dokter/blokir klinik lain tidak berubah.

### 2. Respons `POST` menambah `conflicts`
`conflicting_bookings` (jumlah total) tetap. Ditambah:

```json
"conflicts": [
  { "id": 12, "patient_name": "Budi", "patient_phone": "6281234560105", "booked_time": "2026-11-20T10:00:00.000000Z" }
]
```

- Urut `booked_time` naik, dibatasi **50 baris**. Bila total lebih dari 50, `conflicting_bookings` tetap berisi jumlah sebenarnya sehingga UI bisa menulis "dan N lainnya, lihat di Booking".
- Kriteria bentrok berubah menjadi hanya status `confirmed` (bukan `active()`), dan **jumlah serta daftar memakai satu query dasar yang sama** (`count()` dan `limit(50)->get()` darinya). Ini mengubah angka `conflicting_bookings` untuk booking `completed` di rentang blokir (tidak lagi dihitung); tes Task 6 yang ada (`confirmed` dihitung, `cancelled` tidak) tetap lulus.
- Hanya kolom di atas yang dikirim (bukan seluruh model).

### 3. Tes (PHPUnit, gaya `tests/Feature/BlockedTimeTest.php`; boleh digabung ke file itu atau file baru)
- `POST /api/...` membuat blokir, tersimpan UTC, status 201.
- `POST` dengan booking bentrok: `conflicts` berisi pasien yang benar, tidak berisi booking `cancelled`/`completed`, tidak berisi booking di luar `[start, end)`.
- `conflicts` dibatasi 50 sementara `conflicting_bookings` jumlah penuh.
- `GET /api/.../blocked-times?upcoming=1` dan `DELETE /api/blocked-times/{id}` lewat `/api`.
- Klinik lain: 403; tanpa login: 401 (bukan redirect).
- Tes web yang ada tetap lulus tanpa diubah.

---

## Perubahan Frontend

### File

```
frontend/lib/blocked.ts            tipe + fungsi murni (tanpa import runtime): clinicLocalToUtc, buildBlockRange, formatBlockRange, waLink, blockedPath
frontend/lib/blocked.test.ts       node:test untuk fungsi di atas
frontend/lib/blocked-api.ts        fetchBlocks, createBlock, deleteBlock (memakai api())
frontend/components/Shell.tsx      Shell dipindah dari bookings/page.tsx, nav diberi prop `active`
frontend/app/blocked-times/page.tsx  halaman
frontend/app/bookings/page.tsx     memakai Shell bersama (perubahan minimal)
frontend/app/globals.css           gaya tambahan (kelas `bk__*` sudah di sini)
```

### Navigasi (keputusan builder yang saya ambil)
Halaman baru butuh tautan masuk. `Shell` sekarang ada di dalam `bookings/page.tsx`. Saya **memindahkannya** ke `components/Shell.tsx` dengan prop `active: "bookings" | "blocked" | "akun"` dan menambah tautan "Blokir" di nav. Ini sebagian kecil Task 12, dan tanpanya halaman tak terjangkau. Perilaku halaman booking tidak berubah.

### Tampilan

```
Blokir waktu                                   [ Dr. Ahmad Wijaya ▾ ]

Buat blokir
  Tanggal   [ 20 Nov 2026 ]  s/d  [ 20 Nov 2026 ]
  [ ] Seharian
  Jam       [ 17.00 ]  s/d  [ 19.00 ]
  Alasan    [ Urusan keluarga            ]
                              [ Simpan blokir ]

(setelah simpan, bila bentrok)
  ⚠ 2 pasien sudah booking di waktu ini. Booking mereka tidak diubah.
    Budi   20 Nov 17.30   [ WhatsApp ]
    Sari   20 Nov 18.00   [ WhatsApp ]
    Atur booking di halaman Booking →

Blokir mendatang
  20 Nov  15.00-16.00            Rapat             [Hapus]
  20 Nov  17.00-19.00            Urusan keluarga   [Hapus]
  26 Nov - 2 Des  (seharian)     Annual Leave      [Hapus]
```

- **Pemilih dokter di kanan atas** berlaku untuk form dan daftar (satu dokter pada satu waktu). Alasan: rute API per dokter; untuk 2-3 dokter per klinik ini cukup dan tidak butuh N permintaan. (Keputusan builder, bisa diubah.)
- Centang **Seharian** menyembunyikan kolom jam. Blokirnya: 00.00 tanggal mulai sampai 00.00 **hari setelah** tanggal selesai (waktu klinik). Akhir eksklusif sudah sesuai logika bentrok `[start, end)` dan menghindari angka ganjil 23.59.
- Tanpa Seharian, tanggal mulai dan selesai bebas (blokir 17.00 hari ini sampai 09.00 besok boleh).
- Daftar: `?upcoming=1`, urut waktu, paginasi "Sebelumnya/Berikutnya" dengan pola 9c. Blokir yang mulai 00.00 dan berakhir 00.00 (atau 23.59) di zona klinik ditulis "seharian"; cuti beberapa hari ditulis sebagai rentang tanggal.

### Validasi di form (sebelum kirim)
- Alasan wajib, maksimal 255 karakter (sama dengan backend).
- Tanggal selesai tidak boleh sebelum tanggal mulai.
- Tanpa Seharian: waktu akhir harus setelah waktu mulai (memperhitungkan tanggal).
- Error dari server (422) ditampilkan di bawah form; 401 → `/login`; 403 / `clinic: null` → "Akun ini belum terhubung ke klinik" (sama dengan 9c).
- Boleh membuat blokir yang sebagian atau seluruhnya sudah lewat (misalnya "sakit sejak pagi"); tidak ada larangan.

### Fungsi murni (diuji `node --test`)

| Fungsi | Tugas |
|---|---|
| `clinicLocalToUtc(date, time, tz)` | "2026-11-20", "17:00", "Asia/Jakarta" → `"2026-11-20T10:00:00.000Z"`. Dihitung dari offset zona di instan itu (`Intl.DateTimeFormat` + `formatToParts`), tanpa pustaka baru; benar juga untuk zona ber-DST. |
| `buildBlockRange(form, tz)` | Dari isi form (mode seharian atau jam) → `{ start_time, end_time }` UTC, atau pesan error validasi. |
| `formatBlockRange(startIso, endIso, tz)` | Teks untuk daftar: "20 Nov  17.00-19.00", "26 Nov - 2 Des (seharian)". Data rusak → "-". |
| `waLink(phone, text)` | `https://wa.me/<nomor>?text=<pesan>`. Nomor dibersihkan: hanya digit, awalan `0` diganti `62`. |
| `blockedPath(practitionerId, page)` | `/practitioners/1/blocked-times?upcoming=1&page=2` (tanpa `/api`, seperti `bookingsPath`). |

**Pesan WhatsApp** (keputusan builder, bahasa Indonesia): "Halo {nama}, mohon maaf, jadwal Anda pada {tanggal} pukul {jam} di {klinik} perlu diubah karena dokter berhalangan. Boleh kami bantu atur jadwal pengganti?" Dibuka di tab baru (`target="_blank"`, `rel="noopener"`), tidak dikirim otomatis.

### Keadaan halaman
Memuat (kerangka), daftar kosong ("Belum ada blokir mendatang untuk dokter ini"), error dengan "Coba lagi", sesi habis, akun tanpa klinik. Mengganti dokter cepat-cepat: respons lama yang datang belakangan tidak boleh menimpa tampilan (pola `alive`/penanda permintaan seperti 9c). Klik "Simpan" dua kali: satu permintaan (tombol nonaktif selama mengirim). Setelah simpan sukses: form dikosongkan, daftar dimuat ulang, panel bentrok tampil sampai staf mengganti dokter atau membuat blokir lain. Layar < 760px: baris daftar menjadi kartu, tanpa scroll horizontal.

---

## Daftar Cek (manual, dengan Laravel asli)

- Buat blokir sebagian hari 17.00-19.00 → muncul di daftar; `POST /api/bookings` di jam itu ditolak 422 (slot tidak tersedia), seperti di Task 6.
- Buat blokir kedua 15.00-16.00 di hari yang sama → keduanya tampil, urut waktu.
- Cuti 3 hari dengan "Seharian" → tampil sebagai rentang tanggal; jam di database: 00.00 WIB hari pertama sampai 00.00 WIB hari setelah hari terakhir (UTC 17.00).
- Blokir di atas booking `confirmed` → panel bentrok memuat pasien yang benar; booking `cancelled` tidak ikut; tombol WhatsApp membuka `wa.me` dengan pesan terisi; status booking tidak berubah.
- Hapus blokir → hilang dari daftar, slot kembali tersedia.
- Akun klinik lain tidak melihat atau menghapus blokir ini (403).
- Laravel dimatikan → pesan error + "Coba lagi" memulihkan.
- 375px tanpa scroll horizontal; semua kontrol terjangkau keyboard dengan fokus terlihat.

```bash
# backend
docker compose exec -T app php artisan test --filter=BlockedTime
# frontend
cd frontend && npm test && npm run lint && npx tsc --noEmit && npm run build
```

## Kriteria Selesai

- [ ] `/blocked-times` membuat, mendaftar, dan menghapus blokir untuk dokter terpilih, semua jam dalam zona klinik.
- [ ] Blokir sebagian hari (beberapa di hari yang sama) dan cuti berhari-hari bekerja.
- [ ] Respons `POST` memuat `conflicts` (maks. 50) dan jumlah penuh; UI menampilkan pasien dengan tombol WhatsApp; tidak ada booking yang diubah.
- [ ] Tiga rute `/api` ada, dilindungi `auth:sanctum` + `has.clinic`; rute web lama dan tesnya tidak rusak.
- [ ] Nav punya tautan "Blokir"; `Shell` dipakai bersama oleh `/bookings` dan `/blocked-times`.
- [ ] Tes backend, `npm test`, `npm run lint`, `tsc`, dan `npm run build` bersih. `package-lock.json` root tidak ikut ter-commit.

## Risiko / Hal yang Perlu Diperhatikan Pembangun

- **Zona waktu adalah risiko utama.** Uji `clinicLocalToUtc` pada tengah malam dan akhir bulan; jangan pakai `new Date("2026-11-20T17:00")` (dibaca zona browser).
- Sebelum menulis kode Next.js, baca panduan di `frontend/node_modules/next/dist/docs/` (aturan `frontend/AGENTS.md`).
- `Shell` dipindah tanpa mengubah tampilan `/bookings`; periksa bahwa halaman itu tetap sama.
- Nomor telepon booking belum tentu berawalan 62; `waLink` harus menormalkannya dan, bila nomor tidak masuk akal (kosong, terlalu pendek), tombol dinonaktifkan dengan keterangan.

## Langkah Berikutnya

Setelah disetujui: rencana implementasi di `docs/superpowers/plans/2026-11-20-task-10-blocked-times-page.md` (pola yang sama dengan 9c). Lalu Task 11 (Pengaturan), Task 12 (layout dan navigasi penuh), Task 13 (tes dan polish).
