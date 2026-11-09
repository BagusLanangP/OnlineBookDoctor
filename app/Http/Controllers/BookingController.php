<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreBookingRequest;
use App\Http\Requests\UpdateBookingRequest;
use App\Models\Booking;
use App\Models\Practitioner;
use App\Services\AvailabilityService;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BookingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $bookings = Booking::query()
            ->whereHas('practitioner', fn ($q) => $q->where('clinic_id', $request->user()->clinic->id))
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->when($request->query('practitioner_id'), fn ($q, $id) => $q->where('practitioner_id', $id))
            ->with('practitioner:id,name')
            ->orderBy('booked_time')
            ->paginate(20);

        return response()->json($bookings);
    }

    public function store(StoreBookingRequest $request, AvailabilityService $availability): JsonResponse
    {
        $data = $request->validated();
        $practitioner = Practitioner::with('clinic')->findOrFail($data['practitioner_id']);
        $bookedTime = Carbon::parse($data['booked_time'], 'UTC')->utc();

        // AvailabilityService works per clinic-local date, so convert first.
        $localDate = $bookedTime->copy()
            ->setTimezone($practitioner->clinic->timezone)
            ->toDateString();

        $isAvailable = collect($availability->getAvailableSlots($practitioner, $localDate))
            ->contains(fn ($slot) => $slot['datetime_utc']->equalTo($bookedTime));

        if (! $isAvailable) {
            throw ValidationException::withMessages([
                'booked_time' => 'This time slot is not available.',
            ]);
        }

        try {
            $booking = DB::transaction(function () use ($data, $bookedTime) {
                // Option A (see "Decisions" #2): a cancelled row would trip the
                // unique index even though the slot is free.
                Booking::where('practitioner_id', $data['practitioner_id'])
                    ->where('booked_time', $bookedTime)
                    ->where('status', 'cancelled')
                    ->delete();

                return Booking::create([
                    'practitioner_id' => $data['practitioner_id'],
                    'patient_name' => $data['patient_name'],
                    'patient_phone' => $data['patient_phone'],
                    'visit_reason' => $data['visit_reason'],
                    'booked_time' => $bookedTime,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            // Two requests passed the availability check at the same moment;
            // the DB unique index lets only one win.
            throw ValidationException::withMessages([
                'booked_time' => 'This time slot was just taken.',
            ]);
        }

        return response()->json($booking->load('practitioner:id,name'), 201);
    }

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
}