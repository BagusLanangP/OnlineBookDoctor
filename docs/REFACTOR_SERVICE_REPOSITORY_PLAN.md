# Refactor Plan: Service-Repository Pattern

**Deliverable:** Memindahkan logika bisnis dari controller ke **Service**, dan semua query database ke **Repository**, tanpa mengubah perilaku aplikasi.
**Tujuan utama:** belajar pola Service-Repository (dipakai di tempat magang) dengan latihan pada kode nyata yang sudah punya test.
**Dependencies:** Task 1-8 (semua endpoint dan halaman yang ada sekarang). Task 9 (Bookings List) dikerjakan SETELAH pola ini mapan.
**Estimated Time:** 6-10 jam total, dipecah per fase (1-2 jam per fase)
**Status:** Keputusan disetujui (16 November 2026), siap mulai Fase 0/1. Lihat bagian "Keputusan yang Disetujui".

---

## Sketch

```
SEKARANG                                 TARGET

Request                                  Request
   │                                        │
   ▼                                        ▼
Controller                               Controller        ← tipis: terima request, panggil service, balas
 ├─ aturan bisnis                           │
 ├─ transaksi DB                            ▼
 ├─ query Eloquent                       Service           ← aturan bisnis, transaksi, koordinasi
 └─ format respons                          │
   │                                        ▼
   ▼                                     Repository        ← satu-satunya tempat query
Model / Database                            │
                                            ▼
                                         Model / Database
```

Pertanyaan pemeriksa untuk setiap baris kode:

| Kode ini menjawab... | Maka tempatnya |
|---|---|
| "Apa yang dikirim balik ke browser?" | Controller |
| "Kapan boleh / tidak boleh? Apa urutannya?" | Service |
| "Bagaimana data diambil / disimpan?" | Repository |

---

## Kondisi Sekarang (hasil pemeriksaan kode)

| File | Baris | Logika yang menumpuk di controller |
|---|---|---|
| `BookingController` | 94 | `store`: cek slot tersedia, konversi timezone, transaksi, hapus booking cancelled (Option A), tangani race condition. `index`: query + filter + paginate |
| `BlockedTimeController` | 60 | `store`: simpan blok lalu hitung booking yang bentrok (`conflicting_bookings`) |
| `ScheduleController` | 42 | CRUD sederhana + cek kepemilikan klinik |
| `ScheduleWeekController` | 138 | `update`: transaksi hapus hari yang tidak dikirim + `updateOrCreate` per hari |
| `DashboardController` | 63 | 3 query berbeda + hitung batas "hari ini" dalam timezone klinik + mapping array |
| `AvailabilityService` | - | Sudah service, TAPI memanggil `Schedule::`, `Booking::`, `BlockedTime::` langsung |

Pola berulang yang ditemukan:
- `abort_unless($x->clinic_id === $request->user()->clinic->id, 403)` muncul di 4+ tempat.
- Query "booking aktif milik practitioner X dalam rentang waktu" muncul di `BookingController`, `BlockedTimeController`, `DashboardController`, dan `AvailabilityService`.
- Konversi timezone klinik ke UTC ditulis ulang di beberapa tempat.

Jaring pengaman yang sudah ada (jangan diubah isinya selama refactor):

| File test | Jumlah test |
|---|---|
| `tests/Feature/BookingTest.php` | 15 |
| `tests/Feature/BlockedTimeTest.php` | 11 |
| `tests/Feature/ScheduleTest.php` | 10 |
| `tests/Feature/ScheduleWeekTest.php` | 16 |
| `tests/Feature/DashboardTest.php` | 9 |
| `tests/Unit/AvailabilityServiceTest.php` | 11 |

---

## Struktur Target

```
app/
├── Http/Controllers/          (tipis)
├── Services/
│   ├── AvailabilityService.php      (sudah ada, nanti memakai repository)
│   ├── BookingService.php
│   ├── BlockedTimeService.php
│   ├── ScheduleService.php
│   └── DashboardService.php
└── Repositories/
    ├── Contracts/
    │   ├── BookingRepositoryInterface.php
    │   ├── BlockedTimeRepositoryInterface.php
    │   ├── ScheduleRepositoryInterface.php
    │   └── PractitionerRepositoryInterface.php
    └── Eloquent/
        ├── EloquentBookingRepository.php
        ├── EloquentBlockedTimeRepository.php
        ├── EloquentScheduleRepository.php
        └── EloquentPractitionerRepository.php

app/Providers/AppServiceProvider.php   → bind interface ke implementasi di register()
tests/Unit/Services/                   → test service dengan repository palsu (Mockery)
```

Model yang TIDAK diberi repository: `User` dan `Clinic`. Keduanya hanya dibaca lewat relasi (`$request->user()->clinic`), tidak ada query kompleks.

---

## Keputusan yang Disetujui

| # | Keputusan | Hasil |
|---|---|---|
| 1 | Interface atau class biasa | Interface + binding (usulan awal; belum ada konfirmasi mentor, bisa disesuaikan nanti) |
| 2 | Repository untuk model mana | **Mulai dari `Booking` dulu**, model lain menyusul per fase |
| 3 | Controller memanggil repository langsung | **Tidak.** Selalu Controller → Service → Repository |
| 4 | Cek kepemilikan klinik (403) | **Opsi A:** tetap di controller/FormRequest selama refactor |
| 5 | Exception dari service | Tetap `ValidationException` (respons 422 tidak berubah) |
| 6 | Mapping array untuk Inertia | Tetap di controller; service mengembalikan model/collection |
| 7 | Strategi branch/PR | Satu PR per fase; refactor tidak dicampur dengan fitur |

Catatan branch: Docker belum ter-merge ke `main`, sedangkan test dijalankan lewat Docker. Karena itu branch refactor dicabangkan dari `feat/docker-setup` (= `main` + 1 commit Docker). PR refactor dibuka setelah PR Docker ter-merge (lalu `git rebase origin/main`), atau dengan base `feat/docker-setup`.

---

## ⚠️ Decisions to Review Before Coding

### 1. Pakai interface atau class biasa?

- **Interface + binding** (target di atas): service bergantung pada kontrak, mudah di-mock dan diganti. Lebih banyak file.
- **Class repository saja**: lebih ringkas, tetapi service terikat ke implementasi Eloquent.

**Usulan:** pakai interface (itu bentuk yang umum di perusahaan dan bagian penting yang perlu dipelajari). **Konfirmasi ke mentor** apakah tim memakai interface.

### 2. Repository untuk model mana saja?

**Usulan:** `Booking`, `BlockedTime`, `Schedule`, `Practitioner`. Mulai dari `Booking` karena paling kaya logika.

### 3. Controller boleh memanggil repository langsung?

**Usulan:** TIDAK. Alur selalu Controller → Service → Repository, walaupun service hanya meneruskan (misalnya `ScheduleService::list()`). Konsisten lebih mudah dipelajari. **Konfirmasi ke mentor.**

### 4. Cek kepemilikan klinik (`abort_unless ... 403`) ditaruh di mana?

Sekarang tersebar di controller.
- **Opsi A:** tetap di controller/FormRequest (urusan HTTP/otorisasi).
- **Opsi B:** pindah ke service sebagai pengecekan bisnis.
- **Opsi C:** Laravel Policy.

**Usulan:** Opsi A selama refactor (tidak mengubah perilaku), catat Policy sebagai perbaikan lanjutan.

### 5. Service melempar apa saat aturan dilanggar?

Sekarang `BookingController` melempar `ValidationException` (respons 422). Test sudah mengunci perilaku ini.
**Usulan:** service tetap melempar `ValidationException` agar respons tidak berubah. Exception khusus domain bisa dipertimbangkan nanti.

### 6. Siapa yang membentuk array untuk halaman Inertia (`DashboardController` memetakan model ke array)?

**Usulan:** service mengembalikan model/collection, mapping ke array tetap di controller (atau API Resource nanti). Service tidak tahu format tampilan.

### 7. Strategi branch dan PR

- Satu PR per fase, dari `main`, supaya mudah direview.
- Fase 1, 2, 4 aman dari `main` (Booking API, BlockedTime API, Dashboard sudah di `main`).
- Fase 3 menyentuh `ScheduleWeekController` yang masih di `feat/p2-schedule-page`. **Tunggu PR Task 8 ter-merge** atau cabangkan dari branch itu.
- Refactor TIDAK dicampur dengan fitur baru dalam satu PR.

---

## Aturan Main Selama Refactor

1. **Tidak ada perubahan perilaku.** Test yang sudah ada harus tetap hijau tanpa diedit.
2. Jalankan test setelah setiap method yang dipindah, bukan di akhir.
3. Pindahkan sedikit demi sedikit: satu method, jalankan test, commit kecil.
4. Controller akhir hanya boleh berisi: validasi (FormRequest), otorisasi singkat, panggilan service, dan respons.
5. Tidak ada `Model::query()`, `Model::where()` di service dan controller. Query hanya di repository.
6. Aturan bisnis tidak boleh ada di repository (repository tidak memutuskan "boleh/tidak").

Perintah test (Docker):
```bash
docker compose exec app php artisan test
docker compose exec app php artisan test --filter=BookingTest
```

---

## Fase Pengerjaan

### Fase 0: Baseline ✅ (17 November 2026)
- Branch `refactor/service-repository-base` dari `feat/docker-setup` (lihat catatan branch di atas; jadi `main` setelah PR Docker ter-merge dan di-rebase).
- Hasil baseline: **81 test lulus, 340 assertion**, dijalankan lokal (`php artisan test`, SQLite in-memory). Ini patokan "sebelum".
- Semua hijau sebelum menyentuh kode.

### Fase 1: Booking (latihan utama)
Urutan dari paling mudah:
1. Buat `BookingRepositoryInterface` dan `EloquentBookingRepository` (method awal: `search`, `updateStatus`).
2. Daftarkan binding di `AppServiceProvider::register()`.
3. Buat `BookingService`. Pindahkan `index` → `update` → `destroy` → `store`.
4. `store` paling akhir (transaksi, availability, race condition). Method repository: `create`, `deleteCancelledAt`.
5. Test lulus setelah tiap method. Tambah unit test `BookingServiceTest` dengan repository palsu.

**Definisi selesai:** `BookingController` tidak lagi memanggil `Booking::` dan tidak berisi transaksi; `BookingTest` (15) hijau tanpa perubahan.

### Fase 2: BlockedTime
- `BlockedTimeRepository`: `listForPractitioner`, `create`, `delete`.
- `BlockedTimeService::create` mengembalikan blok + jumlah booking bentrok (memanggil `BookingRepository::countActiveBetween`).
- Latihan kunci: **satu service memakai dua repository**.

**Selesai:** `BlockedTimeTest` (11) hijau.

### Fase 3: Schedule dan ScheduleWeek
(Menunggu PR Task 8 ter-merge.)
- `ScheduleRepository`: `forPractitioner`, `deleteDaysNotIn`, `upsertDay`.
- `ScheduleService::syncWeek` memegang transaksi dari `ScheduleWeekController::update`.

**Selesai:** `ScheduleTest` (10) dan `ScheduleWeekTest` (16) hijau.

### Fase 4: Dashboard
- `DashboardService::getTodayOverview($clinic)` memegang perhitungan "hari ini dalam timezone klinik" dan memanggil repository.
- Controller hanya memetakan hasil ke props Inertia.

**Selesai:** `DashboardTest` (9) hijau.

### Fase 5: AvailabilityService memakai repository
- Ganti `Schedule::`, `Booking::`, `BlockedTime::` di `AvailabilityService` dengan pemanggilan repository.
- Fase ini paling berisiko karena logika slot kompleks. Dikerjakan terakhir saat pola sudah dikuasai.

**Selesai:** `AvailabilityServiceTest` (11) dan `BookingTest` tetap hijau.

### Fase 6: Task 9 dengan pola baru
- Filter tanggal dan perubahan status Task 9 ditulis langsung di repository dan service.
- Detail desain mengikuti dokumen `TASK_9_BOOKINGS_PAGE_DESIGN.md` (dibuat saat fase ini dimulai).

---

## Strategi Test

| Jenis | Isi | Perubahan |
|---|---|---|
| Feature test (sudah ada) | Mengetes HTTP end-to-end dengan database nyata | **Tidak boleh diedit**; jadi bukti perilaku sama |
| Unit test service (baru) | `BookingService` dengan repository di-mock (Mockery) | Ditambah per fase, untuk belajar manfaat interface |
| Repository | Tidak dites terpisah | Sudah tercakup feature test |

Contoh yang dipelajari dari unit test service: aturan "slot tidak tersedia → ValidationException" bisa dites tanpa database sama sekali.

---

## Risiko

| Risiko | Mitigasi |
|---|---|
| Perilaku berubah diam-diam | Test lama tidak diedit; commit kecil; jalankan test tiap langkah |
| Over-engineering (file banyak, isinya hanya meneruskan) | Terima untuk tujuan belajar; jangan menambah method repository yang belum dipakai |
| Konflik dengan PR Task 8/9 yang berjalan | Satu PR per fase; Fase 3 menunggu Task 8 ter-merge |
| Konvensi berbeda dengan tim magang | Konfirmasi pertanyaan di bawah sebelum Fase 1 |

---

## Pertanyaan untuk Mentor

1. Apakah tim memakai interface untuk repository?
2. Lokasi folder: `app/Repositories` dan `app/Services`, atau struktur lain?
3. Apakah controller boleh memanggil repository langsung, atau wajib lewat service?
4. Apakah ada `BaseRepository` yang diwariskan?
5. Penamaan method repository yang dipakai tim (`findById`, `getAll`, atau lainnya)?
6. Di mana otorisasi (kepemilikan data) diletakkan?

---

## Yang TIDAK Dikerjakan di Refactor Ini

- Tidak ada fitur baru dan tidak ada perubahan endpoint, respons, atau tampilan.
- Tidak ada perubahan skema database.
- Tidak mengganti `abort_unless` dengan Policy (catatan lanjutan).
- Tidak membuat API Resource untuk format respons (catatan lanjutan).
- Tidak memberi repository untuk `User` dan `Clinic`.

---

## Next Steps

Setelah rencana ini disetujui:
1. Jawab pertanyaan mentor di atas, sesuaikan Decision #1-#4.
2. Mulai Fase 0 (baseline test), lalu Fase 1 (Booking).
3. Setelah Fase 1-2 selesai dan pola dikuasai, lanjut Fase 3-5.
4. Mulai Task 9 pada Fase 6.
