# Refactor `BookingController::store` ke Service-Repository

**Fase:** 1, langkah terakhir (setelah `index`, `update`, `destroy`).
**Aturan utama:** tidak ada perubahan perilaku. `BookingTest` (15) dan seluruh test (81) harus tetap hijau tanpa diedit.
**Status:** panduan untuk dikerjakan sendiri. Belum ada kode `store` yang dipindah.

---

## 1. Prasyarat

`store` dikerjakan paling akhir. Pastikan ini sudah selesai dan hijau:

- [x] `index` sudah lewat `BookingService::list` (commit `8d51ef2`).
- [ ] `update` dan `destroy` sudah lewat service.
  - `UpdateBookingRequest` hanya menerima `status` bernilai `completed` atau `cancelled`, jadi method repository yang tepat adalah `updateStatus(Booking $booking, string $status)`.
  - Pengecekan kepemilikan klinik tetap di controller/FormRequest (Keputusan #4).

---

## 2. Apa saja yang dikerjakan `store` sekarang

`store` saat ini mencampur enam tanggung jawab dalam satu method. Memisahkannya adalah inti latihan ini.

| # | Yang dilakukan kode | Pertanyaan pemeriksa | Tempat tujuan |
|---|---|---|---|
| 1 | `$request->validated()` | Validasi input HTTP | **Controller / FormRequest** (tetap) |
| 2 | `Practitioner::with('clinic')->findOrFail(...)` | Bagaimana data diambil? | **Repository** (`PractitionerRepository`) |
| 3 | Parse `booked_time` ke UTC dan hitung tanggal lokal klinik | Aturan/urutan bisnis | **Service** |
| 4 | Cek slot tersedia lewat `AvailabilityService`, jika tidak lempar `ValidationException` | Kapan boleh / tidak boleh? | **Service** |
| 5 | `DB::transaction`: hapus booking `cancelled`, lalu `Booking::create` | Transaksi = koordinasi (service). Query-nya = repository | **Service** (transaksi), **Repository** (query) |
| 6 | Tangkap `UniqueConstraintViolationException` lalu lempar `ValidationException` | Aturan bisnis: slot keburu diambil | **Service** |
| 7 | `$booking->load('practitioner:id,name')` dan `response()->json(..., 201)` | `load` adalah query. Respons adalah urusan HTTP | `load` ke **Repository**, respons tetap di **Controller** |

---

## 3. Target

```
StoreBookingRequest   → validasi + cek practitioner milik klinik (sudah ada, tidak diubah)
        │
BookingController::store   → panggil service, balas 201
        │
BookingService::create
   ├─ PractitionerRepository::findWithClinic()      ← ambil practitioner
   ├─ hitung waktu UTC + tanggal lokal klinik
   ├─ AvailabilityService::getAvailableSlots()      ← cek slot (masih pakai Model langsung; dibereskan di Fase 5)
   ├─ DB::transaction
   │     ├─ BookingRepository::deleteCancelledAt()
   │     └─ BookingRepository::create()
   └─ tangkap UniqueConstraintViolationException → ValidationException
```

---

## 4. Langkah pengerjaan

Kerjakan berurutan. Jalankan test dan commit kecil di akhir tiap langkah.

### Langkah A: `PractitionerRepository`

File `PractitionerRepositoryInterface.php` dan `EloquentPractitionerRepository.php` sudah ada tetapi masih kosong.

`app/Repositories/Contracts/PractitionerRepositoryInterface.php`
```php
<?php

namespace App\Repositories\Contracts;

use App\Models\Practitioner;

interface PractitionerRepositoryInterface
{
    // Kembalikan practitioner beserta relasi clinic-nya.
    // Dibutuhkan karena service perlu timezone klinik.
    // Kalau tidak ditemukan, lempar ModelNotFoundException (sama seperti findOrFail sekarang).
    public function findWithClinic(int $id): Practitioner;
}
```

`app/Repositories/Eloquent/EloquentPractitionerRepository.php`
```php
<?php

namespace App\Repositories\Eloquent;

use App\Models\Practitioner;
use App\Repositories\Contracts\PractitionerRepositoryInterface;

class EloquentPractitionerRepository implements PractitionerRepositoryInterface
{
    public function findWithClinic(int $id): Practitioner
    {
        // Persis baris pertama di store() sekarang.
        return Practitioner::with('clinic')->findOrFail($id);
    }
}
```

Daftarkan binding di `AppServiceProvider::register()`:
```php
$this->app->bind(
    PractitionerRepositoryInterface::class,
    EloquentPractitionerRepository::class,
);
```

Catatan: biarkan `Schedule` dan `BlockedTime` repository kosong dulu. Menurut aturan, jangan menambah yang belum dipakai.

### Langkah B: Dua method baru di `BookingRepository`

Tambahkan ke `BookingRepositoryInterface`:
```php
use App\Models\Booking;
use Carbon\CarbonInterface;

// Hapus baris booking berstatus 'cancelled' pada slot ini.
// Perlu karena unique index (practitioner_id, booked_time) tetap menolak
// slot yang sudah dipakai booking cancelled (Option A).
public function deleteCancelledAt(int $practitionerId, CarbonInterface $bookedTime): void;

// Simpan booking baru. Mengembalikan booking beserta relasi practitioner (id, name).
public function create(array $data): Booking;
```

Isi di `EloquentBookingRepository`:
```php
public function deleteCancelledAt(int $practitionerId, CarbonInterface $bookedTime): void
{
    // Dipindah persis dari dalam transaksi di store().
    Booking::where('practitioner_id', $practitionerId)
        ->where('booked_time', $bookedTime)
        ->where('status', 'cancelled')
        ->delete();
}

public function create(array $data): Booking
{
    // load() di sini menggantikan $booking->load(...) yang tadinya di controller.
    // load() itu query, jadi tempatnya di repository.
    return Booking::create($data)->load('practitioner:id,name');
}
```

Repository **tidak** memutuskan boleh atau tidaknya booking dibuat. Dia hanya menyimpan.

### Langkah C: `BookingService::create`

Tambahkan dependensi ke constructor, lalu method `create`:

```php
use App\Models\Booking;
use App\Repositories\Contracts\PractitionerRepositoryInterface;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

public function __construct(
    private BookingRepositoryInterface $bookings,
    private PractitionerRepositoryInterface $practitioners,
    private AvailabilityService $availability,
) {}

public function create(array $data): Booking
{
    $practitioner = $this->practitioners->findWithClinic($data['practitioner_id']);
    $bookedTime = Carbon::parse($data['booked_time'], 'UTC')->utc();

    // AvailabilityService bekerja per tanggal lokal klinik, jadi konversi dulu.
    $localDate = $bookedTime->copy()
        ->setTimezone($practitioner->clinic->timezone)
        ->toDateString();

    $isAvailable = collect($this->availability->getAvailableSlots($practitioner, $localDate))
        ->contains(fn ($slot) => $slot['datetime_utc']->equalTo($bookedTime));

    if (! $isAvailable) {
        throw ValidationException::withMessages([
            'booked_time' => 'This time slot is not available.',
        ]);
    }

    try {
        // Transaksi dipegang service karena dialah yang tahu dua langkah ini
        // harus berhasil bersama. Repository hanya menjalankan masing-masing query.
        return DB::transaction(function () use ($data, $bookedTime) {
            $this->bookings->deleteCancelledAt($data['practitioner_id'], $bookedTime);

            return $this->bookings->create([
                'practitioner_id' => $data['practitioner_id'],
                'patient_name' => $data['patient_name'],
                'patient_phone' => $data['patient_phone'],
                'visit_reason' => $data['visit_reason'],
                'booked_time' => $bookedTime,
            ]);
        });
    } catch (UniqueConstraintViolationException) {
        // Dua request lolos cek ketersediaan bersamaan; unique index memastikan hanya satu menang.
        throw ValidationException::withMessages([
            'booked_time' => 'This time slot was just taken.',
        ]);
    }
}
```

### Langkah D: Controller menjadi tipis

```php
public function store(StoreBookingRequest $request, BookingService $service): JsonResponse
{
    $booking = $service->create($request->validated());

    return response()->json($booking, 201);
}
```

Setelah ini hapus `use` yang tidak terpakai lagi di controller (`Practitioner`, `Carbon`, `DB`, `UniqueConstraintViolationException`, `ValidationException`, `AvailabilityService`). `Booking` masih dipakai oleh type-hint di `update` dan `destroy`.

---

## 5. Bagian yang rawan salah

| Rawan | Penjelasan |
|---|---|
| **Urutan di transaksi** | Hapus booking `cancelled` dulu, baru `create`. Terbalik berarti unique index menolak. Test `test_cancelled_slot_can_be_booked_again` yang menjaga ini. |
| **`try/catch` harus membungkus `DB::transaction`** | Pelanggaran unique terjadi saat `create`, di dalam transaksi. Kalau catch dipasang di dalam closure, transaksi tidak ter-rollback dengan benar. |
| **`copy()` pada Carbon** | `$bookedTime->copy()->setTimezone(...)`. Tanpa `copy()`, `setTimezone` mengubah `$bookedTime` itu sendiri dan waktu yang disimpan jadi salah. |
| **Jenis exception harus sama** | Tetap `ValidationException` agar respons 422 tidak berubah (Keputusan #5). Jangan diganti exception baru. |
| **`Booking::` di service** | Service tidak boleh memanggil `Booking::` atau `Practitioner::` (Aturan 5). Kalau kamu tergoda menulisnya, itu tanda methodnya harus ke repository. |
| **Status booking baru** | `create` tidak mengisi `status`, jadi nilainya berasal dari default kolom di database. Jangan menambahkan `'status' => ...` karena itu mengubah perilaku. |
| **`AvailabilityService` masih memakai Model langsung** | Itu disengaja. Jangan sentuh sekarang, itu Fase 5. |

---

## 6. Test yang menjaga `store`

Semua di `tests/Feature/BookingTest.php`. Tidak boleh diedit.

| Test | Yang dijaga |
|---|---|
| `test_can_create_booking_in_open_slot` | Jalur sukses, respons 201 |
| `test_cannot_double_book_same_slot` | Slot sudah terisi ditolak |
| `test_cannot_book_outside_schedule_hours` | Di luar jam praktik ditolak |
| `test_cannot_book_on_day_without_schedule` | Hari tanpa jadwal ditolak |
| `test_cannot_book_in_the_past` | Waktu lampau ditolak |
| `test_validation_errors_for_invalid_fields` | Validasi FormRequest |
| `test_cancelled_slot_can_be_booked_again` | Penghapusan booking `cancelled` dan urutan transaksi |
| `test_cannot_book_with_other_clinics_practitioner` | Practitioner klinik lain ditolak |

Perintah:
```bash
php artisan test --filter=BookingTest
php artisan test
```

Catatan: tidak ada test yang mensimulasikan race condition (`UniqueConstraintViolationException`). Jadi cabang `catch` tidak terlindungi oleh feature test. Setelah selesai, pertimbangkan unit test service di bawah untuk menutupnya.

---

## 7. Unit test service (opsional, bagian belajar)

`tests/Unit/Services/BookingServiceTest.php`, memakai Mockery dan tanpa database.

Ide kasus:
1. **Slot tidak tersedia**: `AvailabilityService` di-mock mengembalikan array kosong, harapannya `ValidationException` dengan pesan `This time slot is not available.`, dan `bookings->create` **tidak pernah dipanggil**.
2. **Race condition**: `bookings->create` di-mock melempar `UniqueConstraintViolationException`, harapannya `ValidationException` dengan pesan `This time slot was just taken.`.

Catatan teknis: `DB::transaction` di unit test tanpa database akan gagal. Kasus ini lebih mudah diuji lewat feature test atau dengan `RefreshDatabase`. Kalau terasa menyulitkan, kasus 1 saja sudah cukup sebagai latihan.

---

## 8. Definisi selesai

- [ ] `BookingController::store` hanya berisi: panggil service, balas 201.
- [ ] Tidak ada `Booking::`, `Practitioner::`, `DB::`, atau `Carbon` di controller.
- [ ] Tidak ada `Booking::` atau `Practitioner::` di `BookingService`.
- [ ] `php artisan test` hijau (81 test) tanpa mengedit test lama.
- [ ] Commit kecil per langkah A, B, C, D.

## 9. Setelah ini

Lanjut Fase 2 (`BlockedTime`). `BlockedTimeService::create` akan memakai dua repository sekaligus, termasuk `BookingRepository::countActiveBetween`.
