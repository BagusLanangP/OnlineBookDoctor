<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreBookingRequest;
use App\Http\Requests\UpdateBookingRequest;
use App\Models\Booking;
use App\Services\BookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    public function index(Request $request, BookingService $bookings): JsonResponse
    {
        // Controller hanya: ambil data dari request -> panggil service -> balas.
        // Tidak ada lagi Booking:: di method ini.
        $result = $bookings->list(
            $request->user()->clinic->id,
            $request->query('status'),
            $request->query('practitioner_id'),
        );

        return response()->json($result);
    }

    public function store(StoreBookingRequest $request, BookingService $service): JsonResponse
    {
        $booking = $service->create($request->validated());

        return response()->json($booking, 201);
    }

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
}