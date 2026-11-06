<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreScheduleRequest;
use App\Http\Requests\UpdateScheduleRequest;
use App\Models\Practitioner;
use App\Models\Schedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ScheduleController extends Controller
{
    public function index(Request $request, Practitioner $practitioner): JsonResponse
    {
        abort_unless($practitioner->clinic_id === $request->user()->clinic->id, 403);

        return response()->json($practitioner->schedules);
    }

    public function store(StoreScheduleRequest $request, Practitioner $practitioner): JsonResponse
    {
        $schedule = $practitioner->schedules()->create($request->validated());

        return response()->json($schedule, 201);
    }

    public function update(UpdateScheduleRequest $request, Schedule $schedule): JsonResponse
    {
        $schedule->update($request->validated());

        return response()->json($schedule);
    }

    public function destroy(Request $request, Schedule $schedule): JsonResponse
    {
        abort_unless($schedule->practitioner->clinic_id === $request->user()->clinic->id, 403);

        $schedule->delete();

        return response()->json(status: 204);
    }
}