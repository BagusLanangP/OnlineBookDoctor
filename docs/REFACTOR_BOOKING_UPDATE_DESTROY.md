# Refactor `BookingController::update` dan `destroy`

**Fase:** 1, langkah 3 dan 4 (setelah `index`, sebelum `store`).
**Aturan utama:** tidak ada perubahan perilaku. Test lama tidak boleh diedit.
**Tujuan belajar:** memahami kenapa dua method yang kelihatannya sepele tetap melewati tiga lapisan, dan di mana batas tugas tiap lapisan.
**Status:** panduan untuk dikerjakan sendiri.

---

## 1. Kode sekarang

```php
public function update(UpdateBookingRequest $request, Booking $booking): JsonResponse
{
    $booking->update($request->validated());

    return response()->json($booking);
}

public function destroy(Request $request, Booking $booking): JsonResponse
{
    abort_unless($booking->practitioner->clinic_id === $request->user()->clinic->id, 403);

    $booking->update(['status' => 'cancelled']);

    return response()->json(status: 204);
}
```

Hal yang perlu dipahami sebelum memindahkan apa pun:

| Hal | Penjelasan |
|---|---|
| `Booking $booking` di parameter | **Route model binding.** Laravel membaca `{booking}` di URL, mengambil baris dari database, dan mengisinya ke parameter. Query-nya terjadi sebelum method berjalan. |
| `UpdateBookingRequest::authorize()` | Cek kepemilikan klinik untuk `update` sudah ada di FormRequest, bukan di controller. Hasilnya 403 jika bukan milik klinik user. |
| `UpdateBookingRequest::rules()` | Hanya menerima `status` bernilai `completed` atau `cancelled`. Jadi data yang sampai ke `update` sudah bersih. |
| `destroy` | **Bukan menghapus.** Hanya mengubah status menjadi `cancelled` (soft cancel). Kalau dipanggil dua kali, hasilnya tetap sama (idempotent), dan test mengunci ini. |
| `abort_unless` di `destroy` | Cek kepemilikan klinik ditulis di controller karena `destroy` tidak punya FormRequest. |

---

## 2. Yang menarik: dua method, satu operasi

Perhatikan bahwa `update` dan `destroy` melakukan hal yang sama di database: **mengubah kolom `status`**.

| | Nilai status | Sumbernya |
|---|---|---|
| `update` | `completed` atau `cancelled` | Dikirim user |
| `destroy` | selalu `cancelled` | Ditetapkan oleh aplikasi |

Artinya hanya **satu** method repository yang dibutuhkan, dan dua method service yang memakainya.

---

## 3. Pembagian tugas

| Kode | Pertanyaan | Tempat |
|---|---|---|
| Validasi `status` dan cek kepemilikan (`update`) | Aturan input HTTP | **FormRequest** (tetap) |
| `abort_unless ... 403` di `destroy` | Otorisasi singkat | **Controller** (tetap, Keputusan #4) |
| Memutuskan bahwa "hapus booking" berarti "ubah status jadi cancelled" | Aturan bisnis | **Service** |
| `$booking->update([...])` | Bagaimana data disimpan? | **Repository** |
| `response()->json(...)` dan kode 204 | Apa yang dikirim ke browser? | **Controller** |

Poin terpenting ada di baris ketiga. **Kata "cancelled" milik service, bukan milik repository.** Repository hanya tahu "ubah status menjadi X". Service yang tahu bahwa menghapus booking artinya memberi X = `cancelled`. Kalau suatu hari aturannya berubah (misalnya hapus booking berarti isi `deleted_at`), cukup service yang diubah.

---

## 4. Langkah pengerjaan

### Langkah 1: Method repository `updateStatus`

Tambahkan ke `BookingRepositoryInterface`:

```php
use App\Models\Booking;

// Ubah status satu booking. Repository tidak peduli statusnya apa
// dan tidak memutuskan boleh atau tidak; dia hanya menyimpan.
public function updateStatus(Booking $booking, string $status): Booking;
```

Isi di `EloquentBookingRepository`:

```php
use App\Models\Booking;

public function updateStatus(Booking $booking, string $status): Booking
{
    $booking->update(['status' => $status]);

    // Kembalikan OBJEK YANG SAMA, bukan hasil query baru.
    // Lihat bagian "Rawan salah" nomor 1 untuk alasannya.
    return $booking;
}
```

`Eloquent::update()` mengembalikan `bool`, bukan model, jadi kita yang mengembalikan `$booking` sendiri.

### Langkah 2: Dua method di `BookingService`

```php
use App\Models\Booking;

// Dipakai oleh update(): status datang dari user (sudah divalidasi FormRequest).
public function updateStatus(Booking $booking, string $status): Booking
{
    return $this->bookings->updateStatus($booking, $status);
}

// Dipakai oleh destroy(): di sini aturan bisnisnya hidup.
// "Menghapus" booking = menandainya cancelled, data tidak dibuang.
public function cancel(Booking $booking): void
{
    $this->bookings->updateStatus($booking, 'cancelled');
}
```

Isinya terlihat hanya meneruskan, dan itu wajar untuk sekarang. Yang penting, **keputusan** `'cancelled'` sekarang tertulis di service, bukan di controller.

### Langkah 3: Controller

```php
public function update(UpdateBookingRequest $request, Booking $booking, BookingService $service): JsonResponse
{
    // validated('status') mengambil satu field saja dari data yang sudah divalidasi.
    $booking = $service->updateStatus($booking, $request->validated('status'));

    return response()->json($booking);
}

public function destroy(Request $request, Booking $booking, BookingService $service): JsonResponse
{
    // Otorisasi tetap di controller (Keputusan #4).
    abort_unless($booking->practitioner->clinic_id === $request->user()->clinic->id, 403);

    $service->cancel($booking);

    return response()->json(status: 204);
}
```

Catatan urutan parameter: parameter yang diisi Laravel dari container (`BookingService`) boleh di mana saja, asalkan type-hint-nya jelas.

**Cek setelah tiap langkah:**
```bash
php artisan test --filter=BookingTest
php artisan test
```
Target: 81 lulus.

**Commit kecil:**
```bash
git commit -m "refactor: move booking update and destroy to service and repository"
```

---

## 5. Rawan salah

| # | Rawan | Penjelasan |
|---|---|---|
| 1 | **Mengambil ulang booking di repository** | Jangan menulis `Booking::find($booking->id)` atau `$booking->fresh()` di `updateStatus`. Objek `$booking` yang dibawa dari route sudah pernah memuat relasi `practitioner` (karena `authorize()` mengaksesnya). Kalau diganti objek baru dari database, relasi itu hilang, dan isi respons JSON `update` bisa berubah. **Ini hasil penalaran dari membaca kode, belum saya buktikan dengan menjalankannya.** Untuk membuktikannya, tambahkan sementara `dd(response()->json($booking)->getData());` di controller sebelum dan sesudah refactor, lalu bandingkan. |
| 2 | **Test tidak menjaga isi respons `update`** | `test_can_mark_booking_completed` hanya memeriksa `assertOk()`, bukan isi JSON. Jadi kalau isi respons berubah diam-diam, test tetap hijau. Itulah alasan poin 1 harus diperiksa manual. |
| 3 | **Mengubah `cancel()` jadi menghapus baris** | Jangan. `destroy` harus tetap soft cancel, dan `test_destroy_soft_cancels_and_is_idempotent` mengunci perilaku itu (dipanggil dua kali tetap 204 dan status `cancelled`). |
| 4 | **Memindahkan `abort_unless` ke service** | Jangan sekarang. Keputusan #4 menetapkan otorisasi tetap di controller/FormRequest selama refactor. Perbaikan lanjutan: Policy. |
| 5 | **`$request->validated()` diteruskan utuh ke service** | Bisa jalan, tetapi service jadi menerima array tak terdefinisi. Lebih jelas meneruskan satu nilai `status`. Ini juga yang membuat tipe parameter service bisa ditulis `string`. |
| 6 | **Menaruh `'cancelled'` di repository** | Itu aturan bisnis. Aturan 6: repository tidak memutuskan apa pun. |

---

## 6. Catatan lanjutan (bukan bagian refactor ini)

Dua hal yang kamu temukan lewat dokumen ini, tetapi sengaja **tidak diubah** sekarang:

1. **`abort_unless` di `destroy` memicu query di controller.** `$booking->practitioner` adalah lazy load, jadi controller secara tidak langsung menjalankan query. Menurut Aturan 5 itu seharusnya di repository, tetapi karena dipindahkan bersama otorisasi, tunggu keputusan soal Policy.
2. **Cek kepemilikan tersebar di dua gaya.** `update` memakai `authorize()` di FormRequest, `destroy` memakai `abort_unless` di controller. Menyatukannya (misalnya dengan Policy) adalah pekerjaan terpisah.

---

## 7. Test yang menjaga

Semua di `tests/Feature/BookingTest.php`:

| Test | Yang dijaga |
|---|---|
| `test_can_mark_booking_completed` | `update` mengubah status jadi `completed`, respons 200 |
| `test_update_rejects_confirmed_and_garbage_status` | Validasi status (tetap di FormRequest) |
| `test_destroy_soft_cancels_and_is_idempotent` | `destroy` = soft cancel, aman dipanggil dua kali, respons 204 |
| `test_cannot_update_or_delete_other_clinics_booking` | 403 untuk booking klinik lain |

---

## 8. Definisi selesai

- [ ] `update` dan `destroy` tidak lagi memanggil `$booking->update(...)` langsung.
- [ ] `BookingService` punya `updateStatus` dan `cancel`.
- [ ] `BookingRepositoryInterface` punya `updateStatus`, dan `EloquentBookingRepository` mengimplementasikannya.
- [ ] Respons `update` sudah dibandingkan sebelum dan sesudah (lihat Rawan salah nomor 1).
- [ ] `php artisan test` hijau (81 test) tanpa mengedit test lama.
- [ ] Commit kecil.

## 9. Setelah ini

Lanjut ke `store`: `docs/REFACTOR_BOOKING_STORE.md`.
