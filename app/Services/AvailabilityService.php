<?php

namespace App\Services;

use App\Models\BlockedTime;
use App\Models\Booking;
use App\Models\Practitioner;
use App\Models\Schedule;
use Carbon\Carbon;

/**
 * Computes which time slots a practitioner can be booked at, on a given date,
 * by combining their weekly Schedule with existing Bookings and BlockedTimes.
 */
class AvailabilityService
{
    // Fixed slot length for every practitioner. Not configurable per Phase 2
    // decision — simpler for MVP, can become a per-practitioner setting later.
    public const SLOT_MINUTES = 30;

    /**
     * @return array<int, array{time: string, datetime_utc: Carbon}>
     */
    public function getAvailableSlots(Practitioner $practitioner, string $date): array
    {
        // Schedule.start_time/end_time are clinic-local wall-clock times (e.g. "09:00"),
        // but Booking/BlockedTime are stored in UTC. We need the clinic's timezone to
        // translate between the two, or every comparison below would be silently wrong.
        $timezone = $practitioner->clinic->timezone;
        $localDate = Carbon::parse($date, $timezone)->startOfDay();

        // No schedule row for this day of week = practitioner doesn't work that day.
        $schedule = Schedule::where('practitioner_id', $practitioner->id)
            ->where('day_of_week', $localDate->dayOfWeek)
            ->first();

        if (! $schedule) {
            return [];
        }

        // ->format('H:i:s') strips the (irrelevant) date Carbon attached when it parsed
        // the raw TIME column, so we can safely re-attach today's actual $date instead.
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

        // A slot only counts if it fully fits before closing time — so for a
        // 09:00-17:00 day, the last slot is 16:30 (ends exactly at 17:00),
        // never 16:45 (would run 15 minutes past closing).
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
        // ->active() excludes cancelled bookings on purpose: a patient who cancelled
        // must free up their slot for someone else, not keep it locked forever.
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

        // Unlike bookings, a BlockedTime isn't aligned to the 30-minute slot grid
        // (e.g. a block from 14:15-14:45 straddles two slots) — so this can't be an
        // exact-match check like removeBookedSlots. It's a standard interval-overlap
        // test: the slot and the block overlap if slot starts before block ends AND
        // slot ends after block starts.
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
        // Without this, checking "today's" availability in the afternoon would still
        // offer a 9 AM slot that has already come and gone.
        return array_values(array_filter(
            $slots,
            fn ($slot) => $slot['datetime_utc']->isFuture()
        ));
    }
}
