<?php

namespace App\Repositories\Contracts;

// Namespace harus sama persis dengan folder (huruf besar-kecil juga).
// Itu sebabnya folder tadi kita ganti jadi "Contracts".
use App\Models\Booking;
// CarbonInterface dipakai untuk parameter booked_time. Kita pakai interface supaya bisa pakai Carbon, CarbonImmutable, atau DateTimeImmutable.
use Carbon\CarbonInterface;
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
        ?CarbonInterface $from = null,
        ?CarbonInterface $to = null,
    ): LengthAwarePaginator;

    public function updateStatus(Booking $booking, string $status): Booking;

    // Hapus baris booking berstatus 'cancelled' pada slot ini.
    // Perlu karena unique index (practitioner_id, booked_time) tetap menolak
    // slot yang sudah dipakai booking cancelled (Option A).
    public function deleteCancelledAt(int $practitionerId, CarbonInterface $bookedTime): void;

    // Simpan booking baru. Mengembalikan booking beserta relasi practitioner (id, name).
    public function create(array $data): Booking;
}
