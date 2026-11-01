# Task 3: AvailabilityService - Detailed Design

**Deliverable:** A service class that answers "what time slots can this practitioner be booked at, on this date?"  
**Dependencies:** Task 1 (Practitioner, Schedule, Booking, BlockedTime models). Independent of Task 2 (auth) — this is pure business logic, no `$request->user()` involved.  
**Estimated Time:** 2-3 hours (the core logic is small; most of the time is the timezone edge cases)

---

## Why This Task Is Tricky

Three pieces of data live in two different "clocks":

| Data | Stored as | Represents |
|---|---|---|
| `Schedule.start_time` / `end_time` | `TIME` (e.g. `09:00:00`) | Clinic's **local** wall-clock time — no date, no timezone |
| `Booking.booked_time` | `TIMESTAMP`, UTC | An exact instant |
| `BlockedTime.start_time` / `end_time` | `TIMESTAMP`, UTC | An exact instant |
| `Clinic.timezone` | string (e.g. `Asia/Jakarta`) | The offset that turns "local 09:00" into a UTC instant |

A practitioner's schedule says "9 AM to 5 PM," but that's 9 AM *in the clinic's city*, not UTC. To check "is 09:00 already booked," we have to convert that local 09:00 into UTC first, because that's the clock `Booking.booked_time` uses. Get this wrong and every slot check is off by the clinic's UTC offset (e.g., 7 hours for `Asia/Jakarta`) — it would silently show wrong availability instead of crashing, which is the dangerous kind of bug.

---

## File Structure

```
app/Services/
└── AvailabilityService.php      (new)

tests/Unit/
└── AvailabilityServiceTest.php  (new)
```

No controller or route in this task — Task 4-6 (APIs) will call this service. This task is the engine, tested in isolation.

---

## Public Interface

```php
namespace App\Services;

use App\Models\Practitioner;
use Carbon\Carbon;

class AvailabilityService
{
    public const SLOT_MINUTES = 30;

    /**
     * @return array<int, array{time: string, datetime_utc: Carbon}>
     */
    public function getAvailableSlots(Practitioner $practitioner, string $date): array
}
```

- `$date` is a plain `'Y-m-d'` string (e.g. `'2026-11-05'`), interpreted **in the clinic's own timezone** — it means "that calendar day as the clinic experiences it," not a UTC day.
- Return value is a list of slots, each with:
  - `time` — local-time label for display, e.g. `'09:00'`
  - `datetime_utc` — the exact `Carbon` instant in UTC, ready to hand straight to `Booking::create(['booked_time' => ...])` in Task 5. No caller should ever have to re-derive this conversion.

**Why return both, not just one:** the UI needs `time` to show a button labeled "09:00"; the booking-creation step needs `datetime_utc` to store the exact instant. Returning only the label would force Task 5 to redo the same timezone math — exactly the kind of double-implementation that causes the two to drift out of sync.

---

## Step-by-Step Algorithm (with the "why" at each step)

### Step 1: Resolve the clinic's timezone

```php
$timezone = $practitioner->clinic->timezone; // e.g. "Asia/Jakarta"
```

**Why `$practitioner->clinic` and not pass timezone as a param:** the timezone is a property of the clinic, not a choice the caller should make per-call. Deriving it from the practitioner keeps the public method signature simple (`Practitioner`, `string $date`) and makes it impossible to call with a mismatched timezone by mistake. Requires eager-loading `practitioner.clinic` or lazy-loading here — lazy load is fine, this runs once per call, not in a loop.

### Step 2: Find the schedule for that day

```php
$localDate = Carbon::parse($date, $timezone)->startOfDay();
$dayOfWeek = $localDate->dayOfWeek; // Carbon: 0=Sunday..6=Saturday, matches our schema

$schedule = Schedule::where('practitioner_id', $practitioner->id)
    ->where('day_of_week', $dayOfWeek)
    ->first();

if (! $schedule) {
    return [];
}
```

**Why check `$localDate->dayOfWeek` and not `date('N', ...)` or similar:** Carbon's `dayOfWeek` already returns 0-6 with Sunday=0, which is exactly the convention Task 1's migration comment uses (`// 0=Sun, 1=Mon, ..., 6=Sat`). No manual remapping needed — matching conventions here avoids a classic off-by-one.

**Why return `[]` immediately when no schedule exists:** a day the practitioner doesn't work has no slots, full stop — no need to even look at bookings or blocks for that day.

### Step 3: Build the local start/end instants for that date

```php
$localStart = Carbon::parse(
    $date . ' ' . $schedule->start_time->format('H:i:s'),
    $timezone
);
$localEnd = Carbon::parse(
    $date . ' ' . $schedule->end_time->format('H:i:s'),
    $timezone
);
```

**Why `->format('H:i:s')` on `$schedule->start_time` first, instead of using the Carbon instance directly:** `Schedule::$casts` makes `start_time` a `datetime:H:i:s` cast, which means PHP-side it's a full `Carbon` object — but the *date part* of that object is whatever date happened to be attached when Carbon parsed the raw `"09:00:00"` string (effectively "today," at read time). If we combined that Carbon object with `$date` naively, we'd risk carrying over the wrong date component. Extracting just the `H:i:s` string and re-parsing against the actual `$date` we care about sidesteps that entirely.

### Step 4: Generate every candidate slot, converted to UTC

```php
$slots = [];
$cursor = $localStart->copy();

while ($cursor->copy()->addMinutes(self::SLOT_MINUTES)->lte($localEnd)) {
    $slots[] = [
        'time' => $cursor->format('H:i'),
        'datetime_utc' => $cursor->copy()->utc(),
    ];
    $cursor->addMinutes(self::SLOT_MINUTES);
}
```

**Why the loop condition is `cursor + 30min <= end` (not `cursor < end`):** a slot must fully fit inside the working window. For a 09:00-17:00 schedule, the last valid slot is 16:30 (16:30+30=17:00 exactly fits); 16:45 would run past closing and must not be offered. This also correctly produces zero slots if the schedule window is shorter than one slot duration (e.g., a 20-minute window).

**Why `.utc()` per slot, not once at the end:** each slot keeps its own `Carbon` instance; converting individually (rather than converting `$localStart`/`$localEnd` once and stepping in UTC) keeps the local-time formatting (`->format('H:i')`) and the UTC conversion visibly paired per slot, which is easier to unit test slot-by-slot.

### Step 5: Remove slots that collide with existing bookings

```php
$bookedTimes = Booking::where('practitioner_id', $practitioner->id)
    ->active() // excludes cancelled, per Task 1's scope
    ->whereBetween('booked_time', [$localStart->copy()->utc(), $localEnd->copy()->utc()])
    ->pluck('booked_time')
    ->map(fn (Carbon $t) => $t->toDateTimeString())
    ->flip(); // for O(1) lookup

$slots = array_values(array_filter($slots, function ($slot) use ($bookedTimes) {
    return ! isset($bookedTimes[$slot['datetime_utc']->toDateTimeString()]);
}));
```

**Why `->active()` and not a raw status check:** reuses the scope Task 1 already defined on `Booking` (`status != 'cancelled'`). A cancelled booking must free up its slot — if we didn't filter cancelled bookings out, a patient who cancelled would permanently block that slot for everyone else, which is a real bug a reasonable clinic owner would immediately notice and report.

**Why exact-match on `booked_time` instead of a range-overlap check:** every booking is created on the same 30-minute grid this service generates (enforced later by Task 5's validation, which must only accept times this service returned). So booking collision is simple equality, not interval overlap — unlike blocked times below, which are **not** grid-aligned.

### Step 6: Remove slots that fall inside a blocked time

```php
$blocks = BlockedTime::where('practitioner_id', $practitioner->id)
    ->where('start_time', '<', $localEnd->copy()->utc())
    ->where('end_time', '>', $localStart->copy()->utc())
    ->get();

$slots = array_values(array_filter($slots, function ($slot) use ($blocks) {
    $slotEnd = $slot['datetime_utc']->copy()->addMinutes(self::SLOT_MINUTES);
    foreach ($blocks as $block) {
        if ($slot['datetime_utc']->lt($block->end_time) && $slotEnd->gt($block->start_time)) {
            return false;
        }
    }
    return true;
}));
```

**Why this is an interval-overlap check and Step 5 wasn't:** a `BlockedTime` can span any arbitrary range — a week-long vacation, a 2-hour meeting starting at 10:15 — not aligned to the 30-minute grid at all. A slot must be excluded if it overlaps the block *at all*, not just if it starts at the exact same instant. The standard interval-overlap test is `slotStart < blockEnd AND slotEnd > blockStart`.

**Why the DB query pre-filters with `start_time < localEnd AND end_time > localStart`:** avoids pulling every blocked time this practitioner has ever had (including, say, a vacation from last year) into PHP just to discard it — the DB does the first coarse filter, PHP does the precise per-slot check.

### Step 7: Drop slots already in the past

```php
$slots = array_values(array_filter(
    $slots,
    fn ($slot) => $slot['datetime_utc']->isFuture()
));
```

**Why this is its own step, not folded into Step 4's generation loop:** keeping it separate and last makes it trivial to unit test in isolation (freeze `now()` with `Carbon::setTestNow()`, assert past slots vanish) without re-deriving the whole schedule/booking/block logic in the same test. It also documents an easy-to-forget requirement explicitly: without it, a clinic owner checking "today's" availability at 2 PM would still see a bookable 9 AM slot.

### Step 8: Return

```php
return $slots;
```

---

## Full Assembled Method

```php
<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\BlockedTime;
use App\Models\Practitioner;
use App\Models\Schedule;
use Carbon\Carbon;

class AvailabilityService
{
    public const SLOT_MINUTES = 30;

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

        $slots = [];
        $cursor = $localStart->copy();
        while ($cursor->copy()->addMinutes(self::SLOT_MINUTES)->lte($localEnd)) {
            $slots[] = [
                'time' => $cursor->format('H:i'),
                'datetime_utc' => $cursor->copy()->utc(),
            ];
            $cursor->addMinutes(self::SLOT_MINUTES);
        }

        $bookedTimes = Booking::where('practitioner_id', $practitioner->id)
            ->active()
            ->whereBetween('booked_time', [$localStart->copy()->utc(), $localEnd->copy()->utc()])
            ->pluck('booked_time')
            ->map(fn (Carbon $t) => $t->toDateTimeString())
            ->flip();

        $slots = array_values(array_filter($slots, fn ($slot) =>
            ! isset($bookedTimes[$slot['datetime_utc']->toDateTimeString()])
        ));

        $blocks = BlockedTime::where('practitioner_id', $practitioner->id)
            ->where('start_time', '<', $localEnd->copy()->utc())
            ->where('end_time', '>', $localStart->copy()->utc())
            ->get();

        $slots = array_values(array_filter($slots, function ($slot) use ($blocks) {
            $slotEnd = $slot['datetime_utc']->copy()->addMinutes(self::SLOT_MINUTES);
            foreach ($blocks as $block) {
                if ($slot['datetime_utc']->lt($block->end_time) && $slotEnd->gt($block->start_time)) {
                    return false;
                }
            }
            return true;
        }));

        return array_values(array_filter(
            $slots,
            fn ($slot) => $slot['datetime_utc']->isFuture()
        ));
    }
}
```

---

## Testing Checklist (`tests/Unit/AvailabilityServiceTest.php`)

Each test uses `RefreshDatabase`, creates its own `Clinic`/`Practitioner`/`Schedule` fixtures (not the shared seeder — unit tests should control their own exact inputs), and most pin `Carbon::setTestNow()` so "today" and "the future" are deterministic.

| # | Scenario | Setup | Assertion |
|---|---|---|---|
| 1 | Full day, nothing booked | Schedule 09:00-17:00, no bookings, no blocks, date is tomorrow | Returns 16 slots (09:00 .. 16:30), none are duplicates |
| 2 | Existing booking removed | Same as #1 + a confirmed booking at 10:00 local | 10:00 is absent from the result; 15 slots returned |
| 3 | Cancelled booking does NOT remove slot | Same as #2 but booking `status = 'cancelled'` | 10:00 **is** present (regression guard for the bug described in Step 5) |
| 4 | Blocked time removes overlapping slots | Block from 14:00-15:00 local | 14:00 and 14:30 both absent; 14:00-15:00 fully excluded even though block isn't grid-aligned (test with a block at 14:15-14:45 too) |
| 5 | No schedule for that day | No `Schedule` row for the requested `day_of_week` | Returns `[]` |
| 6 | Mixed: bookings + blocks together | Booking at 09:00, block 13:00-14:00 | Both removed, rest of slots present |
| 7 | Past slots excluded on "today" | `Carbon::setTestNow('2026-11-05 14:35:00')` (clinic tz), schedule 09:00-17:00 | Only slots from 14:30 onward would show — e.g., 09:00 absent, 15:00 present *(decide exact boundary: is a slot "in progress" at 14:35 considered past? Recommend: yes — only slots whose start is strictly after now remain)* |
| 8 | Non-grid-aligned schedule window | Schedule 09:00-17:05 | Last slot is still 16:30 (16:35 would exceed 17:05... wait: 16:30+30=17:00 ≤ 17:05, so 16:30 is valid; next candidate 17:00+30=17:30 > 17:05, stops there) — asserts the trailing 5 minutes produce no extra partial slot |
| 9 | Timezone correctness | Clinic timezone `Asia/Jakarta` (UTC+7), schedule 09:00 local | First slot's `datetime_utc` equals `02:00:00` UTC on the same calendar date |
| 10 | `datetime_utc` round-trips into a real booking | Take a returned slot, `Booking::create(['booked_time' => $slot['datetime_utc'], ...])` | Succeeds without a unique-constraint or validation error |

---

## Success Criteria

✅ `getAvailableSlots()` returns correct slots for a fully-open day  
✅ Confirmed bookings remove their exact slot; cancelled bookings do not  
✅ Blocked times remove any overlapping slot, even when not grid-aligned  
✅ No schedule for the day → empty array, no error  
✅ Past slots never appear for "today"  
✅ Timezone conversion verified against a non-UTC clinic timezone (`Asia/Jakarta`)  
✅ Every returned `datetime_utc` can be passed straight into `Booking::create()`  

---

## What This Task Deliberately Does NOT Do

- No API endpoint / controller — that's wired up when Task 4-6 need it (and the public patient-facing availability endpoint is Phase 3 scope per our earlier discussion).
- No caching of results — premature at this scale (one clinic's bookings for one day is a tiny query).
- No configurable slot duration per practitioner — `SLOT_MINUTES` stays a fixed class constant per the Phase 2 decision to keep slots fixed at 30 minutes for MVP.
- No handling of a clinic changing its `timezone` after bookings already exist (an edge case with no clean answer — out of scope until it's a real complaint).

---

## Next Steps

After Task 3 is approved and implemented:
- Task 4: Schedule API (CRUD) — doesn't depend on this service
- Task 5: Booking API — calls `getAvailableSlots()` to validate a requested `booked_time` is actually offered before creating the `Booking`
- Task 6: BlockedTime API — doesn't depend on this service, but changes its data
