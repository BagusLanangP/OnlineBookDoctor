<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Schedule;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(Request $request): Response
    {
        $clinic = $request->user()->clinic;
        $tz = $clinic->timezone;

        $practitioners = $clinic->practitioners()
            ->orderBy('name')
            ->get(['id', 'name', 'specialty']);

        $practitionerIds = $practitioners->pluck('id');

        // Decision #2: today in the clinic's timezone, bounds converted to UTC.
        $start = now($tz)->startOfDay()->utc();
        $end = now($tz)->addDay()->startOfDay()->utc();

        $todayBookings = Booking::active()
            ->whereIn('practitioner_id', $practitionerIds)
            ->where('booked_time', '>=', $start)
            ->where('booked_time', '<', $end)
            ->with('practitioner:id,name')
            ->orderBy('booked_time')
            ->get()
            ->map(fn (Booking $b) => [
                'id' => $b->id,
                'time' => $b->booked_time->copy()->setTimezone($tz)->format('H:i'), // Decision #3
                'patient_name' => $b->patient_name,
                'visit_reason' => $b->visit_reason,
                'status' => $b->status,
                'practitioner' => $b->practitioner->name,
            ]);

        $weekSchedules = Schedule::whereIn('practitioner_id', $practitionerIds)
            ->with('practitioner:id,name')
            ->orderBy('start_time')
            ->get()
            ->map(fn (Schedule $s) => [
                'id' => $s->id,
                'day_of_week' => $s->day_of_week,
                'start_time' => substr((string) $s->getRawOriginal('start_time'), 0, 5),
                'end_time' => substr((string) $s->getRawOriginal('end_time'), 0, 5),
                'practitioner' => $s->practitioner->name,
            ]);

        return Inertia::render('Dashboard', [
            'clinic' => $clinic->only(['id', 'name', 'timezone']),
            'practitioners' => $practitioners,
            'todayBookings' => $todayBookings,
            'weekSchedules' => $weekSchedules,
            'todayDow' => now($tz)->dayOfWeek, // Decision #4: 0 = Sunday
        ]);
    }
}