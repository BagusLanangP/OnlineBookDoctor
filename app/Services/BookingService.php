<?php

namespace App\Services;

use App\Models\Booking;
use App\Repositories\Contracts\BookingRepositoryInterface;
use App\Repositories\Contracts\PractitionerRepositoryInterface;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;




class BookingService
{
    // Service meminta INTERFACE, bukan class Eloquent.
    // Laravel mengisinya otomatis lewat binding di langkah 3.
    // "private" di constructor = sekaligus membuat properti $this->bookings.
    public function __construct(
        private BookingRepositoryInterface $bookings,
        private PractitionerRepositoryInterface $practitioners,
        private AvailabilityService $availability,
    ) {}


    // Nama "list" menjawab pertanyaan bisnis, bukan teknis.
    // Sekarang isinya hanya meneruskan; itu normal dan memang bagian dari pola ini.
    public function list(int $clinicId, ?string $status, ?string $practitionerId): LengthAwarePaginator
    {
        return $this->bookings->search($clinicId, $status, $practitionerId);
    }

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

    public function create(array $data): Booking
    {
        // $practitioner ini berfungsi untuk validasi ketersediaan, jadi kita ambil sekaligus dengan relasi clinic-nya.
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
}