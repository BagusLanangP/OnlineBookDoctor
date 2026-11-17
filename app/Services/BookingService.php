<?php

namespace App\Services;

use App\Repositories\Contracts\BookingRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use App\Models\Booking;

class BookingService
{
    // Service meminta INTERFACE, bukan class Eloquent.
    // Laravel mengisinya otomatis lewat binding di langkah 3.
    // "private" di constructor = sekaligus membuat properti $this->bookings.
    public function __construct(
        private BookingRepositoryInterface $bookings,
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
}