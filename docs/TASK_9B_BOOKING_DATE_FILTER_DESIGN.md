# Task 9b: Filter Tanggal Booking dan Endpoint Daftar Dokter

**Deliverable:** `GET /api/bookings?date=2026-11-18` hanya mengembalikan booking pada tanggal itu menurut **zona waktu klinik**, dan `GET /api/practitioners` mengembalikan daftar dokter klinik untuk dropdown filter. Belum ada tampilan; halaman daftar booking di Next.js adalah Task 9c.
**Dependencies:** Task 9a (API + login Sanctum), Refactor Booking (`BookingService`, `BookingRepositoryInterface`), Task 5 (API booking).
**Estimasi:** 2-3 jam (satu filter di tiga lapis, satu endpoint kecil, dua file test).
**Status:** selesai. Kode dan test sudah ditulis (127 test hijau, pint bersih untuk file 9b). Tes manual lewat curl dijalankan sendiri oleh pemilik proyek. Bagian "Fakta dari kode" dibaca langsung dari proyek sebelum kode ditulis.

Task 9 dipecah tiga: **9a** fondasi login/API (sudah selesai), **9b** dokumen ini, **9c** halaman daftar booking di Next.js (tabel, filter, aksi selesai/batal).

---

## Sketch

```
Next.js 9c                          Laravel

GET /api/practitioners ───────────▶ dropdown dokter (id, name, specialty)

GET /api/bookings?date=2026-11-18
        &status=confirmed
        &practitioner_id=3 ───────▶ BookingController@index
                                      │  validasi date (Y-m-d)
                                      ▼
                                    BookingService::list
                                      │  tanggal lokal klinik → rentang UTC
                                      │  [2026-11-17 17:00Z , 2026-11-18 17:00Z)
                                      ▼
                                    EloquentBookingRepository::search
                                         WHERE booked_time >= from AND < to
```

Bagian tersulit hanya satu: **zona waktu**. Booking disimpan dalam UTC, sedangkan "tanggal 18 November" milik klinik di Jakarta berarti 17 November 17.00 UTC sampai 18 November 17.00 UTC.

---

## Fakta dari kode (sudah diperiksa)

| Hal | Kondisi |
|---|---|
| `BookingController::index` | Membaca `status` dan `practitioner_id` dari query, memanggil `BookingService::list($clinicId, $status, $practitionerId)`, membalas JSON paginator. Rute web `/bookings` dan `/api/bookings` memakai controller yang sama, jadi filter baru otomatis berlaku di keduanya |
| `BookingService::list` | Hanya meneruskan ke `BookingRepositoryInterface::search(int $clinicId, ?string $status, ?string $practitionerId)` |
| `EloquentBookingRepository::search` | `whereHas('practitioner', clinic_id)`, `when(status)`, `when(practitioner_id)`, `with('practitioner:id,name')`, `orderBy('booked_time')`, `paginate(20)` |
| Penyimpanan waktu | `config/app.php` `timezone = UTC`. Kolom `bookings.booked_time` bertipe `timestamp`, berisi UTC. Sudah ada indeks pada `booked_time` dan unique `(practitioner_id, booked_time)` |
| Zona waktu klinik | `clinics.timezone`, string, bawaan `Asia/Jakarta`. `User->clinic` tersedia, `AuthController::me` sudah mengirimnya ke frontend |
| Pola konversi yang sudah ada | `DashboardController`: `now($tz)->startOfDay()->utc()` sampai `now($tz)->addDay()->startOfDay()->utc()`. `AvailabilityService`: `Carbon::parse($date, $timezone)->startOfDay()` |
| Status booking | `enum('confirmed','completed','cancelled')` |
| Daftar dokter sekarang | Hanya lewat props Inertia di `DashboardController` dan `ScheduleWeekController`, memakai `$clinic->practitioners()->orderBy('name')->get(['id','name','specialty'])`. Belum ada endpoint JSON |
| `PractitionerRepositoryInterface` | Hanya punya `findWithClinic(int $id)` |
| Test yang sudah ada | `tests/Feature/BookingTest.php`: `test_index_lists_only_own_clinic_bookings_ordered_by_time`, `test_index_filters_by_status`. Keduanya tidak boleh berubah hasilnya |

---

## ⚠️ Keputusan yang Perlu Ditinjau Sebelum Menulis Kode

### 1. Satu parameter `date`, bukan rentang
`?date=YYYY-MM-DD` mewakili satu hari kalender klinik. Halaman 9c membutuhkan "booking hari ini / hari yang dipilih", dan itu cukup. `from` dan `to` bisa ditambah nanti tanpa merusak `date`. **Rekomendasi:** `date` saja.

### 2. Tanpa `date`, perilaku lama dipertahankan
Tanpa parameter, endpoint tetap mengembalikan semua booking terurut waktu. Default "hari ini" adalah urusan tampilan, jadi diputuskan di 9c (Next.js yang mengirim `date` hari ini). Dengan begitu test lama tetap hijau dan rute web tidak berubah diam-diam.

### 3. Konversi zona waktu hidup di **service**, repository menerima UTC
Mengubah "tanggal lokal" menjadi rentang UTC adalah aturan bisnis, jadi tempatnya `BookingService`. Repository hanya menerima dua `CarbonInterface` (`$from`, `$to`), tanpa tahu soal zona waktu atau HTTP. Ini sejalan dengan `deleteCancelledAt(..., CarbonInterface $bookedTime)` yang sudah ada.

### 4. Rentang setengah terbuka: `>= from` dan `< to`
Rumusnya `Carbon::parse($date, $tz)->startOfDay()` sampai `->copy()->addDay()->startOfDay()`, lalu `->utc()`. **Bukan** `+24 jam`: di zona waktu ber-DST sebuah hari bisa 23 atau 25 jam. `<` (bukan `<=`) mencegah booking tepat tengah malam masuk ke dua hari sekaligus. Pola yang sama sudah dipakai `DashboardController`.

### 5. Service butuh zona waktu klinik, jadi tanda tangan `list()` berubah
Sekarang `list(int $clinicId, ?string $status, ?string $practitionerId)`. Usulan:

```php
public function list(
    int $clinicId,
    string $timezone,
    ?string $status,
    ?string $practitionerId,
    ?string $date,
): LengthAwarePaginator
```

Controller menyuplai `$request->user()->clinic->timezone` (relasi sudah dimuat untuk `clinic->id`). Alternatif, menerima objek `Clinic`, lebih rapi tetapi mengikat service ke model. **Rekomendasi:** string `$timezone`. Satu-satunya pemanggil `list()` adalah `BookingController::index`, jadi perubahan ini aman.

### 6. Validasi `date` di Form Request; filter lain tidak ikut diperketat
`IndexBookingRequest` hanya memvalidasi `date`: `['nullable', 'date_format:Y-m-d']`. Nilai seperti `18-11-2026`, `abc`, atau `2026-02-30` dibalas **422 JSON**. `status` dan `practitioner_id` tidak ikut divalidasi sekarang, karena memperketatnya mengubah perilaku endpoint yang sudah ada (status tidak dikenal sekarang menghasilkan daftar kosong). Itu pekerjaan terpisah bila diperlukan.

### 7. `practitioner_id` milik klinik lain tidak bocor
Query tetap difilter `whereHas('practitioner', clinic_id)`, jadi `practitioner_id` dokter klinik lain hanya menghasilkan daftar kosong, bukan data klinik lain. Tidak perlu aturan baru; cukup dites.

### 8. `GET /api/practitioners` mengikuti pola controller yang ada, tanpa service baru
Dashboard dan jadwal mengambil daftar dokter langsung lewat `$clinic->practitioners()`. Endpoint baru melakukan hal yang sama: tanpa service, tanpa repository, karena tidak ada aturan bisnis. Bila nanti ada aturan (misalnya dokter nonaktif), baru dipindah ke repository. Responsnya **array biasa** (bukan paginator): `[{ "id", "name", "specialty" }]`, urut `name`, karena jumlah dokter per klinik kecil.

### 9. Endpoint dokter berada di grup `auth:sanctum` + `has.clinic`
Sama seperti `/api/bookings`: tanpa login 401, akun tanpa klinik 403.

### 10. Format waktu di respons tidak diubah
`booked_time` tetap dikirim sebagai ISO 8601 UTC (default serialisasi Laravel). Mengubahnya ke zona waktu klinik di backend akan mengubah kontrak yang sudah ada. Di 9c, Next.js memformat jam dengan `Intl.DateTimeFormat` memakai `clinic.timezone` dari `/api/user`.

### 11. Tautan paginasi mempertahankan filter
Tambahkan `->withQueryString()` pada `paginate(20)` supaya `next_page_url` dan `prev_page_url` membawa `date`, `status`, dan `practitioner_id`. Tanpa ini halaman 2 kehilangan filter. Perubahan ini hanya menambah query pada tautan.

---

## Struktur File

```
app/Http/Requests/IndexBookingRequest.php                       (baru)
app/Http/Controllers/BookingController.php                      (ubah: index memakai request + timezone + date)
app/Services/BookingService.php                                 (ubah: list menerima timezone, date; hitung rentang UTC)
app/Repositories/Contracts/BookingRepositoryInterface.php       (ubah: search menerima $from, $to)
app/Repositories/Eloquent/EloquentBookingRepository.php         (ubah: where rentang, withQueryString)
app/Http/Controllers/Api/PractitionerController.php             (baru)
routes/api.php                                                  (ubah: tambah GET /practitioners)
tests/Feature/BookingTest.php                                   (ubah: tambah test filter tanggal)
tests/Feature/PractitionerApiTest.php                           (baru)
```

Tidak ada migrasi. Indeks `booked_time` sudah ada.

---

## Langkah 1: Filter Tanggal

### 1a. Repository
`search()` menerima dua parameter baru yang opsional di akhir:

```php
public function search(
    int $clinicId,
    ?string $status,
    ?string $practitionerId,
    ?CarbonInterface $from = null,
    ?CarbonInterface $to = null,
): LengthAwarePaginator;
```

Di implementasi tambahkan, di samping `when(status)` dan `when(practitioner_id)`:

```php
->when($from, fn ($q, $f) => $q->where('booked_time', '>=', $f))
->when($to, fn ($q, $t) => $q->where('booked_time', '<', $t))
```

dan ganti `->paginate(20)` menjadi `->paginate(20)->withQueryString()`.

### 1b. Service
Hitung rentang hanya bila `$date` ada:

```php
$from = $to = null;

if ($date !== null) {
    $startLocal = Carbon::parse($date, $timezone)->startOfDay();
    $from = $startLocal->copy()->utc();
    $to = $startLocal->copy()->addDay()->startOfDay()->utc();
}

return $this->bookings->search($clinicId, $status, $practitionerId, $from, $to);
```

### 1c. Form Request dan controller
`IndexBookingRequest::rules()` mengembalikan `['date' => ['nullable', 'date_format:Y-m-d']]`. `BookingController::index` berubah menjadi:

```php
public function index(IndexBookingRequest $request, BookingService $bookings): JsonResponse
{
    $clinic = $request->user()->clinic;

    return response()->json($bookings->list(
        $clinic->id,
        $clinic->timezone,
        $request->query('status'),
        $request->query('practitioner_id'),
        $request->validated('date'),
    ));
}
```

---

## Langkah 2: Endpoint Daftar Dokter

`Api\PractitionerController@index`:

```php
public function index(Request $request): JsonResponse
{
    return response()->json(
        $request->user()->clinic->practitioners()
            ->orderBy('name')
            ->get(['id', 'name', 'specialty'])
    );
}
```

Daftarkan di `routes/api.php`, di dalam grup `has.clinic`:

```php
Route::get('/practitioners', [PractitionerController::class, 'index']);
```

---

## Testing Checklist

### Filter tanggal (`tests/Feature/BookingTest.php`)
Gunakan klinik `Asia/Jakarta` (UTC+7, tanpa DST). Untuk `date=2026-11-18` rentangnya `2026-11-17 17:00:00Z` sampai `2026-11-18 17:00:00Z` (tidak termasuk batas atas).

- [x] **Hanya tanggal itu:** booking tanggal 17, 18, dan 19 di klinik yang sama, `date=2026-11-18` hanya mengembalikan yang tanggal 18.
- [x] **Batas bawah masuk:** booking pada `2026-11-17 17:00:00Z` (00:00 tanggal 18 lokal) **ikut**.
- [x] **Sebelum batas bawah keluar:** `2026-11-17 16:59:59Z` (23:59:59 tanggal 17 lokal) **tidak ikut**.
- [x] **Batas atas keluar:** `2026-11-18 17:00:00Z` (00:00 tanggal 19 lokal) **tidak ikut**.
- [x] **Akhir hari ikut:** `2026-11-18 16:59:59Z` **ikut**.
- [x] **Memakai zona waktu klinik, bukan UTC:** klinik `Asia/Makassar` (UTC+8) dengan booking yang sama menghasilkan rentang yang bergeser satu jam.
- [x] **Digabung filter lain:** `date` + `status`, dan `date` + `practitioner_id`, hanya mengembalikan irisan.
- [x] **Tanpa `date`:** hasil sama persis dengan sebelumnya (test lama tetap hijau).
- [x] **Tidak bocor antar klinik:** booking klinik lain pada tanggal yang sama tidak muncul; `practitioner_id` milik klinik lain menghasilkan daftar kosong.
- [x] **Format salah:** `date=18-11-2026`, `date=abc`, dan `date=2026-02-30` dibalas 422 dengan error pada `date`.
- [x] **Paginasi:** dengan lebih dari 20 booking, `next_page_url` memuat `date=...` dan filter lainnya.

### Dokter (`tests/Feature/PractitionerApiTest.php`)
- [x] Tanpa login: 401.
- [x] Akun tanpa klinik: 403.
- [x] Mengembalikan dokter klinik sendiri saja (dokter klinik lain tidak muncul), urut `name`.
- [x] Struktur tiap item hanya `id`, `name`, `specialty`.
- [x] Klinik tanpa dokter mengembalikan `[]`, bukan error.

### Manual
```bash
# Setelah login lewat browser atau curl (lihat doc 9a)
curl -b cookies.txt -H "Accept: application/json" \
  "http://localhost:8088/api/bookings?date=2026-11-18"
curl -b cookies.txt -H "Accept: application/json" \
  "http://localhost:8088/api/practitioners"
```

Jalankan juga `php artisan test` dan `./vendor/bin/pint` (seluruh test lama harus tetap hijau).

---

## Kriteria Selesai

- [x] `GET /api/bookings?date=YYYY-MM-DD` mengembalikan hanya booking pada tanggal itu menurut zona waktu klinik, termasuk kasus batas tengah malam.
- [x] `GET /api/practitioners` mengembalikan dokter klinik yang login, urut nama.
- [x] Seluruh test lama tetap hijau; test baru di atas hijau.
- [x] `pint` bersih.
- [x] Tidak ada migrasi dan tidak ada perubahan pada rute web.

---

## Yang TIDAK Dikerjakan Task Ini

- Halaman Next.js (daftar, filter, tombol selesai/batal): Task 9c.
- Filter rentang (`from`/`to`) dan pencarian nama pasien.
- Validasi ketat untuk `status` dan `practitioner_id`.
- Mengubah format `booked_time` di respons.
- Ukuran halaman (`per_page`) yang bisa diatur klien.
- Dokter nonaktif atau pengelolaan dokter lewat API.

---

## Langkah Berikutnya

**Task 9c:** halaman `frontend/app/bookings/page.tsx`. Memuat `/api/user` (untuk zona waktu) dan `/api/practitioners`, lalu `/api/bookings` dengan filter tanggal, status, dan dokter; menampilkan jam dengan `Intl.DateTimeFormat` memakai zona waktu klinik; tombol "Selesai" dan "Batal" memanggil `PUT` dan `DELETE` yang sudah ada. Bersamaan dengan itu, link "Masuk" di homepage dialihkan ke `/login` Next.js dan tombol "Uji bookings" di `/akun` dihapus.
