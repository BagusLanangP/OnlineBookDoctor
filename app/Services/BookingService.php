<?php

namespace App\Services;

use App\Repositories\Contracts\BookingRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

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
}