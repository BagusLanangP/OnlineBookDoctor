<?php

namespace App\Repositories\Eloquent;

use App\Models\Booking;
use App\Repositories\Contracts\BookingRepositoryInterface;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

// "implements" = class ini berjanji memenuhi semua method di interface.
// Kalau ada method yang kurang, PHP langsung error.
class EloquentBookingRepository implements BookingRepositoryInterface
{
    public function search(
        int $clinicId,
        ?string $status,
        ?string $practitionerId,
    ): LengthAwarePaginator {
        // Ini PERSIS query yang sekarang ada di BookingController::index.
        // Cukup dipindah, jangan diubah isinya.
        return Booking::query()
            ->whereHas('practitioner', fn ($q) => $q->where('clinic_id', $clinicId))
            ->when($status, fn ($q, $s) => $q->where('status', $s))
            ->when($practitionerId, fn ($q, $id) => $q->where('practitioner_id', $id))
            ->with('practitioner:id,name')
            ->orderBy('booked_time')
            ->paginate(20);
    }


    public function updateStatus(Booking $booking, string $status): Booking
    {
        $booking->update(['status' => $status]);

        // Kembalikan OBJEK YANG SAMA, bukan hasil query baru.
        // Lihat bagian "Rawan salah" nomor 1 untuk alasannya.
        return $booking;
    }

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
}