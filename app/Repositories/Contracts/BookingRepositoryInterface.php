<?php

namespace App\Repositories\Contracts;
// Namespace harus sama persis dengan folder (huruf besar-kecil juga).
// Itu sebabnya folder tadi kita ganti jadi "Contracts".
use App\Models\Booking;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;

interface BookingRepositoryInterface
{
    // Interface hanya berisi "janji": nama method, parameter, tipe kembalian.
    // TIDAK ada isi method di sini.
    //
    // Parameter dibuat polos (int, ?string), bukan Request.
    // Repository tidak boleh tahu soal HTTP.
    public function search(
        int $clinicId,
        ?string $status,
        ?string $practitionerId,
    ): LengthAwarePaginator;

    public function updateStatus(Booking $booking, string $status): Booking;
    
}