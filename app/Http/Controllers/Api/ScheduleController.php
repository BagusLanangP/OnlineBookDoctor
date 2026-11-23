<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SyncSchedulesRequest;
use App\Models\Practitioner;
use App\Services\ScheduleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Jadwal praktek mingguan untuk Next.js (Task 12). Logika simpan dipakai bersama
 * dengan halaman Inertia lama lewat ScheduleService.
 */
class ScheduleController extends Controller
{
    public function show(Request $request, Practitioner $practitioner, ScheduleService $schedules): JsonResponse
    {
        abort_unless($practitioner->clinic_id === $request->user()->clinic->id, 403);

        return response()->json([
            'practitioner_id' => $practitioner->id,
            'schedules' => $schedules->week($practitioner),
        ]);
    }

    /**
     * Simpan seminggu (hari yang tidak dikirim = libur). Otorisasi dan validasi
     * ada di SyncSchedulesRequest. Keputusan 1 (Task 12): balasan juga memuat
     * pasien confirmed mendatang yang kini di luar jam praktek; booking mereka
     * TIDAK diubah, staf yang memutuskan menghubungi.
     */
    public function update(SyncSchedulesRequest $request, Practitioner $practitioner, ScheduleService $schedules): JsonResponse
    {
        $schedules->syncWeek($practitioner, $request->validated('schedules'));
        [$count, $outside] = $schedules->outsideBookings($practitioner);

        return response()->json([
            'practitioner_id' => $practitioner->id,
            'schedules' => $schedules->week($practitioner),
            'outside_bookings' => $count,
            'outside' => $outside,
        ]);
    }
}
