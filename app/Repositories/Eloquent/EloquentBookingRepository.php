<?php

namespace App\Repositories\Eloquent;

use App\Models\Booking;
use App\Repositories\Contracts\BookingRepositoryInterface;
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
}