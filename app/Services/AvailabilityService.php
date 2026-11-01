<?php

namespace App\Services;

use App\Models\BlockedTime;
use App\Models\Booking;
use App\Models\Practitioner;
use App\Models\Schedule;
use Carbon\Carbon;

class AvailabilityService
{
    public const SLOT_MINUTES = 30;

    /**
     * @return array<int, array{time: string, datetime_utc: Carbon}>
     */
    public function getAvailableSlots(Practitioner $practitioner, string $date): array
    {
        $timezone = $practitioner->clinic->timezone;
        $localDate = Carbon::parse($date, $timezone)->startOfDay();

        $schedule = Schedule::where('practitioner_id', $practitioner->id)
            ->where('day_of_week', $localDate->dayOfWeek)
            ->first();

        if (! $schedule) {
            return [];
        }

        $localStart = Carbon::parse($date.' '.$schedule->start_time->format('H:i:s'), $timezone);
        $localEnd = Carbon::parse($date.' '.$schedule->end_time->format('H:i:s'), $timezone);

        $slots = $this->generateSlots($localStart, $localEnd);
        $slots = $this->removeBookedSlots($slots, $practitioner, $localStart, $localEnd);
        $slots = $this->removeBlockedSlots($slots, $practitioner, $localStart, $localEnd);
        $slots = $this->removePastSlots($slots);

        return $slots;
    }

    /**
     * @return array<int, array{time: string, datetime_utc: Carbon}>
     */
    private function generateSlots(Carbon $localStart, Carbon $localEnd): array
    {
        $slots = [];
        $cursor = $localStart->copy();

        while ($cursor->copy()->addMinutes(self::SLOT_MINUTES)->lte($localEnd)) {
            $slots[] = [
                'time' => $cursor->format('H:i'),
                'datetime_utc' => $cursor->copy()->utc(),
            ];
            $cursor->addMinutes(self::SLOT_MINUTES);
        }

        return $slots;
    }

    /**
     * @param  array<int, array{time: string, datetime_utc: Carbon}>  $slots
     * @return array<int, array{time: string, datetime_utc: Carbon}>
     */
    private function removeBookedSlots(array $slots, Practitioner $practitioner, Carbon $localStart, Carbon $localEnd): array
    {
        $bookedTimes = Booking::where('practitioner_id', $practitioner->id)
            ->active()
            ->whereBetween('booked_time', [$localStart->copy()->utc(), $localEnd->copy()->utc()])
            ->pluck('booked_time')
            ->map(fn (Carbon $t) => $t->toDateTimeString())
            ->flip();

        return array_values(array_filter(
            $slots,
            fn ($slot) => ! isset($bookedTimes[$slot['datetime_utc']->toDateTimeString()])
        ));
    }

    /**
     * @param  array<int, array{time: string, datetime_utc: Carbon}>  $slots
     * @return array<int, array{time: string, datetime_utc: Carbon}>
     */
    private function removeBlockedSlots(array $slots, Practitioner $practitioner, Carbon $localStart, Carbon $localEnd): array
    {
        $blocks = BlockedTime::where('practitioner_id', $practitioner->id)
            ->where('start_time', '<', $localEnd->copy()->utc())
            ->where('end_time', '>', $localStart->copy()->utc())
            ->get();

        if ($blocks->isEmpty()) {
            return $slots;
        }

        return array_values(array_filter($slots, function ($slot) use ($blocks) {
            $slotEnd = $slot['datetime_utc']->copy()->addMinutes(self::SLOT_MINUTES);

            foreach ($blocks as $block) {
                if ($slot['datetime_utc']->lt($block->end_time) && $slotEnd->gt($block->start_time)) {
                    return false;
                }
            }

            return true;
        }));
    }

    /**
     * @param  array<int, array{time: string, datetime_utc: Carbon}>  $slots
     * @return array<int, array{time: string, datetime_utc: Carbon}>
     */
    private function removePastSlots(array $slots): array
    {
        return array_values(array_filter(
            $slots,
            fn ($slot) => $slot['datetime_utc']->isFuture()
        ));
    }
}
