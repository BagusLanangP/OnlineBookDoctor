<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreBlockedTimeRequest;
use App\Models\BlockedTime;
use App\Models\Booking;
use App\Models\Practitioner;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BlockedTimeController extends Controller
{
    public function index(Request $request, Practitioner $practitioner): JsonResponse
    {
        abort_unless($practitioner->clinic_id === $request->user()->clinic->id, 403);

        $blocks = $practitioner->blockedTimes()
            ->when($request->boolean('upcoming'), fn ($q) => $q->where('end_time', '>', now()))
            ->orderBy('start_time')
            ->paginate(20);

        return response()->json($blocks);
    }

    public function store(StoreBlockedTimeRequest $request, Practitioner $practitioner): JsonResponse
    {
        $data = $request->validated();
        $start = Carbon::parse($data['start_time'], 'UTC')->utc();
        $end = Carbon::parse($data['end_time'], 'UTC')->utc();

        $block = $practitioner->blockedTimes()->create([
            'start_time' => $start,
            'end_time' => $end,
            'reason' => $data['reason'],
        ]);

        // Decision #3: warn, don't cancel. A booking is a point in time, so it
        // is "inside" the block if it starts in [start, end).
        $conflicts = Booking::active()
            ->where('practitioner_id', $practitioner->id)
            ->where('booked_time', '>=', $start)
            ->where('booked_time', '<', $end)
            ->count();

        return response()->json(
            $block->toArray() + ['conflicting_bookings' => $conflicts],
            201
        );
    }

    public function destroy(Request $request, BlockedTime $blockedTime): JsonResponse
    {
        abort_unless($blockedTime->practitioner->clinic_id === $request->user()->clinic->id, 403);

        $blockedTime->delete();

        return response()->json(status: 204);
    }
}