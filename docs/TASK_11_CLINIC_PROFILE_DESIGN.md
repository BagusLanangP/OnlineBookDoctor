# Task 11: Profil Klinik di Halaman Akun - Desain

**Hasil akhir:** halaman `/akun` (dengan sidebar dan lembar putih yang sama seperti Booking dan
Blokir waktu) tempat staf mengisi dan mengubah profil klinik (identitas, lokasi, kontak, zona waktu),
mengelola daftar dokter, dan melihat **pratinjau seperti yang dilihat pasien**. Data akun dan tombol
Keluar ada di halaman yang sama.
**Bergantung pada:** Task 9a (login Sanctum, `/api/user`), Task 10 (shell staf, `StaffFrame`, `Shell`).
**Menggantikan:** Task 11 "Settings Page" di `PHASE_2_DETAILED_PLAN.md` (isinya tercakup di sini).
**Status:** selesai (disetujui pemilik proyek 2026-11-23, Keputusan 1 memakai opsi A).

---

## Tujuan dan Kenapa

Data klinik nantinya dibaca **pasien yang ingin mengecek klinik** sebelum booking atau datang. Karena
dibaca orang luar, isinya harus lengkap, benar, dan mudah dibaca. Sekarang `/akun` hanya menampilkan
nama, email, nama klinik, dan zona waktu, tanpa bisa diubah, dan gayanya masih kartu beranda.

## Tujuan / Bukan Tujuan / Anti-tujuan

**Tujuan**
- Satu halaman `/akun` (pilihan A pemilik proyek) berisi tiga bagian: **Profil klinik**, **Dokter**, **Akun**.
- Profil klinik bisa diubah: nama, deskripsi singkat, alamat, kota, tautan peta, telepon, WhatsApp, zona waktu.
- Dokter: tambah, ubah (nama, spesialisasi), hapus. **Jumlah dokter dihitung dari daftar**, tidak diketik.
- Pratinjau "seperti yang dilihat pasien" yang ikut berubah saat form diisi.
- Halaman masuk grup `(staff)`: sidebar, top bar, lembar putih.

**Bukan tujuan** (task berikutnya)
- Halaman publik untuk pasien (pratinjau di sini adalah dasarnya).
- Foto klinik / unggah berkas; jam buka klinik (jam praktek sudah ada per dokter di jadwal).
- Mengubah nama/email/kata sandi pengguna; preferensi notifikasi (Phase 3).
- Membuat klinik baru dari halaman ini (akun tanpa klinik hanya melihat pesan).

**Anti-tujuan**
- Menghapus dokter ikut menghapus riwayat booking pasien tanpa disadari (lihat Keputusan 1).
- Angka jumlah dokter berbeda dari dokter yang benar-benar terdaftar.
- Mengganti zona waktu diam-diam menggeser jam yang dilihat staf tanpa peringatan.

## Keputusan Pemilik Proyek

- Data klinik untuk pasien yang mau mengecek klinik.
- Isi profil: identitas, lokasi, kontak, dokter, zona waktu; pratinjau seperti dilihat pasien.
- Halaman publik pasien dikerjakan nanti.
- Susunan: **A, satu halaman `/akun`**.

## Pendekatan yang Dipertimbangkan

| | Susunan | Untung | Rugi |
|---|---|---|---|
| **A (dipilih)** | Satu halaman `/akun`: klinik, dokter, akun | Satu menu, semua di satu tempat | Halaman lebih panjang; perlu susunan jelas supaya dokter tidak tenggelam |
| B | Tiga halaman: `/klinik`, `/dokter`, `/akun` | Satu halaman satu urusan | Dua menu baru |
| C | Satu halaman dengan tab | Menu tetap satu | Tab mudah terlewat, bagian tidak bisa di-bookmark |

---

## Temuan yang Membentuk Desain

1. `clinics` hanya punya `name`, `phone` (unik), `whatsapp_number` (unik), `timezone`. Kolom lokasi
   dan deskripsi **belum ada** → migrasi baru.
2. Dokter = tabel `practitioners` (`name`, `specialty` nullable, unik per klinik). API hanya punya
   `GET /api/practitioners`.
3. **`bookings`, `schedules`, `blocked_times` memakai `cascadeOnDelete` ke dokter.** Menghapus dokter
   menghapus semua booking pasiennya. Lihat Keputusan 1.
4. `/api/user` hanya mengirim `id, name, timezone` klinik; dipakai halaman lain, jadi tidak diubah.
   Profil lengkap lewat endpoint baru.
5. Nomor pasien di booking disimpan `62…`; `waLink` di frontend sudah menormalkan nomor.

## ⚠️ Keputusan yang Perlu Dikonfirmasi

### 1. Menghapus dokter yang punya booking

| Opsi | Perilaku | Untung / rugi |
|---|---|---|
| **A (usulan)** | Hapus hanya boleh bila dokter **tidak punya booking sama sekali**. Selain itu ditolak dengan pesan "Dokter ini punya N booking, jadi tidak bisa dihapus." | Aman dan sederhana; dokter yang sudah pernah melayani tetap tercatat |
| B | Tambah status **nonaktif** (`is_active`): dokter disembunyikan dari jadwal, booking baru, dan pratinjau; riwayat tetap | Paling tepat untuk dokter yang keluar; perlu migrasi dan penyaringan di availability, booking, dan daftar dokter |
| C | Hapus beserta semua booking-nya (perilaku database sekarang) | Ditolak: kehilangan riwayat pasien |

Dokumen ini memakai **A**. B bisa ditambahkan kemudian tanpa membuang kode A.

---

## Backend

### Migrasi `add_profile_fields_to_clinics_table`
Semua nullable (klinik lama tetap sah):

| Kolom | Tipe | Batas |
|---|---|---|
| `description` | string | 300 karakter |
| `address` | string | 500 |
| `city` | string | 100 |
| `maps_url` | string | 2048 |

`Clinic::$fillable` ditambah keempatnya.

### Endpoint (di `routes/api.php`, grup `auth:sanctum` + `has.clinic`)

```
GET    /api/clinic                     profil klinik milik pengguna
PUT    /api/clinic                     ubah profil (semua kolom dikirim)
POST   /api/practitioners              tambah dokter
PUT    /api/practitioners/{p}          ubah nama/spesialisasi
DELETE /api/practitioners/{p}          hapus (Keputusan 1)
```

`GET /api/clinic` membalas: `id, name, description, address, city, maps_url, phone,
whatsapp_number, timezone`. `PUT` membalas bentuk yang sama.

### Validasi

| Kolom | Aturan |
|---|---|
| `name` | wajib, maks 255 |
| `description` | opsional, maks 300 |
| `address` | opsional, maks 500 |
| `city` | opsional, maks 100 |
| `maps_url` | opsional, URL `https`, maks 2048 |
| `phone`, `whatsapp_number` | wajib; dinormalkan di server ke digit `62…` (`0812…`, `+62 812-…` diterima), 10-15 digit; unik antar klinik (abaikan klinik sendiri) |
| `timezone` | wajib, salah satu dari `Asia/Jakarta`, `Asia/Makassar`, `Asia/Jayapura` |
| dokter `name` | wajib, maks 255, unik di klinik ini (abaikan dokter itu sendiri saat ubah) |
| dokter `specialty` | opsional, maks 255 |

Catatan pembangun (keputusan saya):
- Nomor dinormalkan **sebelum** validasi (`prepareForValidation` di Form Request), supaya cek unik
  membandingkan bentuk yang sama (`0812…` dan `62812…` dianggap nomor yang sama).
- Klinik lama yang zona waktunya di luar tiga pilihan (mis. `UTC` di data tes) tetap tampil apa adanya
  di dropdown sebagai pilihan tambahan, tetapi menyimpan mengharuskan memilih salah satu dari tiga.

Dokter dan klinik lain: **403** (pola `abort_unless` seperti controller lain). Hapus dokter yang punya
booking: **409** dengan `message` dan `bookings_count`.

### Tes (PHPUnit, gaya `BlockedTimeApiTest`)
- GET/PUT klinik: sukses; normalisasi nomor; unik antar klinik tapi boleh menyimpan nomor sendiri;
  timezone di luar daftar → 422; maps_url bukan https → 422; tanpa login 401; tanpa klinik 403.
- Dokter: tambah, ubah, nama ganda di klinik yang sama → 422 (di klinik lain boleh); hapus tanpa
  booking → 204; hapus dengan booking → 409 dan booking tetap ada; dokter klinik lain → 403.

---

## Frontend

### Berkas
```
frontend/app/(staff)/akun/page.tsx   dipindah dari app/akun (git mv), ditulis ulang di Shell
frontend/lib/clinic.ts               tipe + fungsi murni (validasi form, isi pratinjau), dites
frontend/lib/clinic.test.ts
frontend/lib/clinic-api.ts           fetchClinic, updateClinic, createPractitioner, updatePractitioner, deletePractitioner
frontend/lib/me.ts                   Clinic diperluas (atau tipe ClinicProfile terpisah)
frontend/app/globals.css             gaya bagian pengaturan dan pratinjau
```

### Susunan halaman

```
Akun                                                     (h1)
Profil klinik yang dilihat pasien, dokter, dan akun Anda.

┌ Profil klinik ─────────────────────────┐  ┌ Seperti yang dilihat pasien ┐
│ Nama klinik       [Klinik Maju Jaya  ] │  │ Klinik Maju Jaya             │
│ Deskripsi         [                  ] │  │ Klinik umum keluarga …       │
│ Alamat            [Jl. …             ] │  │ Jl. …, Denpasar · Buka peta  │
│ Kota  [Denpasar]  Tautan peta [https…] │  │ Telepon · WhatsApp           │
│ Telepon [0812…]   WhatsApp [0812…]     │  │ 2 dokter                     │
│ Zona waktu [WITA – Asia/Makassar ▾]    │  │  Dr. Ahmad Wijaya · Umum     │
│                         [Simpan profil]│  │  Dr. Siti Nurhaliza · Umum   │
└────────────────────────────────────────┘  └──────────────────────────────┘
Dokter · 2 terdaftar
  Dr. Ahmad Wijaya     Umum                 Ubah  Hapus
  Dr. Siti Nurhaliza   Umum                 Ubah  Hapus
  [Nama dokter      ] [Spesialisasi   ] [Tambah dokter]
Akun
  Rina Wulandari · rina@…                               [Keluar]
```

- ≥ 1180px: kolom kiri (Profil klinik, Dokter, Akun bertumpuk) + pratinjau 360px di kanan yang
  **menempel saat digulir** (sticky). Lebih sempit: pratinjau pindah tepat di bawah form profil.
- Gaya mengikuti shell "framed sheet": panel batu netral `#f3f3f1` radius 12 seperti form Blokir
  waktu, kolom putih, label di atas kolom, satu `h1`, judul bagian 16px.
- **Satu cara simpan per bagian:** Profil klinik punya satu tombol "Simpan profil" (dengan cap
  "Tersimpan" kecil setelah berhasil; tombol nonaktif bila tidak ada perubahan). Dokter dikelola per
  baris (Ubah → kolom di baris itu + Simpan/Batal; Hapus → konfirmasi dua langkah di baris, seperti
  Blokir waktu). Tambah dokter = satu baris form di bawah daftar.
- **Pratinjau** dibuat dari isi form saat ini (belum tersimpan pun tampil, dengan keterangan
  "Belum disimpan" bila ada perubahan). Kolom kosong tidak ditampilkan di pratinjau; nomor ditampilkan
  dalam format `+62 812-…`; "Buka peta" membuka `maps_url` di tab baru.
- **Mengganti zona waktu** menampilkan peringatan di bawah dropdown sebelum simpan: "Semua jam booking
  dan blokir akan ditampilkan dalam zona baru."
- Keadaan: memuat (kerangka), error per bagian dengan "Coba lagi", 401 → `/login`, akun tanpa klinik →
  hanya bagian Akun + pesan "Akun ini belum terhubung ke klinik.", 422 → pesan di bawah kolom yang
  salah (`aria-describedby`), 409 hapus dokter → pesan di baris itu.
- Tombol "Keluar" di bagian Akun (pindah dari kartu lama); "Lihat booking" dihapus karena sidebar
  sudah memuatnya.

### Fungsi murni (`lib/clinic.ts`, dites)
`validateClinicForm(form)` (pesan per kolom, sama dengan aturan server), `isClinicDirty(saved, form)`,
`previewFrom(form, practitioners)` (hanya kolom terisi, jumlah dokter dari daftar),
`TIMEZONES` (nilai dan label "WIB, WITA, WIT"). Format telepon memakai helper yang sama dengan
halaman booking (dipindah ke lib bila perlu).

---

## Daftar Cek Manual (Laravel asli)
- Ubah semua kolom profil → muat ulang → nilai tetap; pratinjau sama dengan yang tersimpan.
- Nomor `0812…` tersimpan `62812…`; nomor klinik lain ditolak; nomor sendiri boleh disimpan ulang.
- Ganti zona waktu ke WITA → jam di `/bookings` bergeser +1 jam; kembalikan.
- Tambah, ubah, dan hapus dokter tanpa booking; muncul/hilang di dropdown `/bookings` dan `/blocked-times`.
- Hapus dokter yang punya booking → ditolak dengan jumlah booking; booking tetap ada.
- 390px: form satu kolom, pratinjau di bawah profil, tanpa scroll horizontal; keyboard dan fokus terlihat.

## Kriteria Selesai
- [x] Migrasi, 5 endpoint, validasi, dan tes backend lulus; tes lama tetap lulus (159 tes PHPUnit).
- [x] `/akun` di dalam shell staf berisi Profil klinik, Dokter, Akun, dan pratinjau.
- [x] Jumlah dokter selalu dihitung dari daftar.
- [x] Dokter dengan booking tidak bisa terhapus (Keputusan 1).
- [x] `npm test` (45 tes), lint, `tsc`, build bersih; inspector taste-skill `--app` 0 FAIL di 1440/768/390
      (`font-not-dealt` diabaikan: arahan font lama beranda, halaman staf memakai Plus Jakarta Sans).

## Catatan Pembangunan
- Backend: `Api\ClinicController` (show/update), `PractitionerController` ditambah store/update/destroy,
  `UpdateClinicRequest` dan `SavePractitionerRequest` (pesan validasi berbahasa Indonesia),
  `Clinic::normalizePhone()` dan `Clinic::TIMEZONES`. Tes: `tests/Feature/ClinicProfileApiTest.php`.
- Frontend: komponen `Field` kecil di halaman (label, `aria-invalid`, `aria-describedby`) dipakai
  oleh form profil dan form dokter. Tipe `Practitioner.specialty` sekarang `string | null`.
- Daftar Cek Manual di atas masih perlu dijalankan dengan Laravel asli; interaksi sudah diperiksa
  dengan API tiruan (simpan nonaktif tanpa perubahan, peringatan zona waktu, pratinjau langsung,
  error kolom, hapus 409, nama dokter ganda).

## Diserahkan ke Pembangun
Nama komponen internal, urutan kolom di dalam form selama sesuai sketsa, teks kerangka memuat,
dan isi pesan error selama berbahasa Indonesia dan menyebut kolomnya.
