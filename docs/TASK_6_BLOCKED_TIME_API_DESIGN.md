# Task 6: BlockedTime API - Detailed Design

**Deliverable:** Create / list / delete endpoints for a practitioner's blocked periods (vacation, meeting, emergency), scoped to the logged-in clinic. `AvailabilityService` already honours blocks, so blocked slots stop being bookable.
**Dependencies:** Task 1 (`BlockedTime`/`Practitioner` models), Task 2 (`has.clinic`), Task 3 (`AvailabilityService::removeBlockedSlots`), Task 4 (nested routing + clinic-scoping pattern), Task 5 (UTC input convention)
**Estimated Time:** 1-1.5 hours (smaller than Task 5: no slot logic, no unique-index problem)

---

## Sketch

```
Owner picks practitioner + period
        │
        ▼
POST /practitioners/{p}/blocked-times ──► validate (end > start, reason)
        │                                      │
        │                                      ▼
        │                              blocked_times row (UTC)
        ▼
GET  /practitioners/{p}/blocked-times ──► list, soonest first
DELETE /blocked-times/{id}            ──► row removed → slots free again

How a block affects booking (no new code, already in Task 3 + Task 5):

 slots 09:00 09:30 10:00 10:30 11:00 11:30
 block        [───── 09:45 → 10:45 ─────]
 result  ok    ✗     ✗     ✗     ok    ok     (any overlap removes the slot)

 POST /bookings at 10:00 → AvailabilityService excludes it → 422
```

---

## ⚠️ Decisions to Review Before Coding

### 1. Routes: nested (like Task 4), not flat (like the original plan)

The plan lists `POST /api/blocked-times` with `practitioner_id` in the body and
`GET /api/blocked-times/1` where `1` is a *practitioner* id. As in Task 4, the
second form is misleading (looks like a single-resource lookup but returns a
list) and there is still no `routes/api.php`. This doc uses shallow nesting:

```
GET    /practitioners/{practitioner}/blocked-times   list that practitioner's blocks
POST   /practitioners/{practitioner}/blocked-times   create
DELETE /blocked-times/{blockedTime}                  delete
```

Consequence: a foreign practitioner/block gives `403` (same as Task 4), not the
`422` that Task 5 gives for a body `practitioner_id`. Say so if you prefer the
plan's flat `POST /blocked-times` with `practitioner_id` in the body (then it is
`422` via `Rule::exists`, exactly like Task 5).

### 2. `start_time` / `end_time` are sent in UTC (same as `booked_time`)

Consistent with Task 5: the API takes UTC (or a value with an offset such as
`2026-11-10T00:00:00+07:00`, which Carbon honours). The plan's example
`"2026-11-10 00:00:00"` has no zone and would be read as UTC, i.e. 07:00 in
Jakarta. **Callers must convert** from clinic-local; Task 10's UI should do this
in one helper. Alternative: accept clinic-local time and convert server-side,
friendlier for "block Nov 10-17" but it makes this API inconsistent with
bookings. This doc keeps one rule (UTC) everywhere.

### 3. Existing bookings inside a new block are NOT cancelled

A block only stops *new* bookings. If a patient already booked 10:00 and the
owner blocks 09:00-12:00, that booking stays `confirmed`. Options:

| Option | Behaviour | Trade-off |
|---|---|---|
| **A (recommended)** | Create the block, return `conflicting_bookings` (count) in the response so the UI can warn | Non-destructive; owner decides what to do with those patients |
| B | Reject with 422 if any active booking falls inside | Safe but blocks the "I'm sick today" case where bookings already exist |
| C | Auto-cancel the conflicting bookings | Destructive, and no notification exists until Phase 3 |

This doc implements **Option A**.

### 4. No update endpoint; overlapping blocks are allowed

The plan has only POST/GET/DELETE. Editing = delete + recreate (same reasoning
as Task 5 for bookings). Overlapping blocks for the same practitioner are
harmless (`removeBlockedSlots` just drops any slot that overlaps any block), so
there is no overlap validation to keep in sync.

### 5. `DELETE` is a hard delete

Unlike bookings, a block has no history value, and "remove it so slots reopen"
is the whole point. Calling it twice → second call is `404` (row gone). The
route-model binding rejects it before our code runs; that is acceptable here.

### 6. Shared ownership check / test helper: NOT extracted in this task

Task 5's doc suggested extracting the ownership check into a Policy and the
test helper into a shared trait by Task 6. That is still a good idea, but
`ScheduleTest` and `BookingTest` live on open PRs (#5, #6) — touching them
here would create merge conflicts. This task repeats the inline pattern a third
time; do the extraction as a separate cleanup after #5/#6 merge, with all three
test files as the safety net.

---

## Endpoints

```
GET    /practitioners/{practitioner}/blocked-times   list (paginated, soonest first)
POST   /practitioners/{practitioner}/blocked-times   create
DELETE /blocked-times/{blockedTime}                  delete
```

`GET` takes an optional `?upcoming=1` (only blocks whose `end_time` is in the
future) because the UI mostly cares about current/future blocks.

## File Structure

```
app/Http/Controllers/
└── BlockedTimeController.php        (new)

app/Http/Requests/
└── StoreBlockedTimeRequest.php      (new)

routes/web.php                       (modify: add 3 routes inside has.clinic group)

tests/Feature/
└── BlockedTimeTest.php              (new)
```

---

## Step 1: Form Request

**File:** `app/Http/Requests/StoreBlockedTimeRequest.php`

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreBlockedTimeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->route('practitioner')->clinic_id === $this->user()->clinic->id;
    }

    public function rules(): array
    {
        return [
            'start_time' => ['required', 'date'],
            'end_time' => ['required', 'date', 'after:start_time'],
            'reason' => ['required', 'string', 'max:255'],
        ];
    }
}
```

**Why `reason` is required:** the migration column is `NOT NULL` with no
default, and the plan's example always sends one.

**Why no "must be in the future" rule:** blocking a period that already started
(e.g. "sick since 08:00") is legitimate, and a fully past block is simply inert.

---

## Step 2: Controller

**File:** `app/Http/Controllers/BlockedTimeController.php`

```php
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
```

**Needed model addition:** `Practitioner` must have a
`blockedTimes(): HasMany` relation. Check `app/Models/Practitioner.php`; add it
if missing (one method, no migration).

**Known limit on the conflict count:** a booking that starts *before* the block
but runs into it (e.g. 09:30-10:00 slot, block starts 09:45) is not counted,
because the count only looks at start times. Slots are 30 min, so this is an
edge case; widen the query by `SLOT_MINUTES` later if the UI needs exactness.

---

## Step 3: Routes

**Modify `routes/web.php`** — add **inside** the existing `has.clinic` group
(Task 5 initially put its routes outside the group by mistake; double-check the
closing `});` after pasting):

```php
use App\Http\Controllers\BlockedTimeController;

    Route::get('/practitioners/{practitioner}/blocked-times', [BlockedTimeController::class, 'index']);
    Route::post('/practitioners/{practitioner}/blocked-times', [BlockedTimeController::class, 'store']);
    Route::delete('/blocked-times/{blockedTime}', [BlockedTimeController::class, 'destroy']);
```

---

## Testing Checklist

**File:** `tests/Feature/BlockedTimeTest.php` — `RefreshDatabase`. Same helper
pattern as `BookingTest` (clinic A + owner + practitioner; clinic B for
isolation). Use `now()->next('Monday')` with a 09:00-17:00 schedule and send
UTC times, as in `BookingTest::mondayUtc()`.

```
1.  POST valid block
    → 201, row stored in UTC, response has conflicting_bookings = 0
2.  POST end_time before/equal start_time
    → 422 (end_time)
3.  POST missing reason / missing times / garbage date
    → 422 with matching field errors
4.  POST block overlapping an existing confirmed booking
    → 201, conflicting_bookings = 1, booking still confirmed
    (cancelled booking inside the block is NOT counted)
5.  GET /practitioners/{p}/blocked-times
    → only that practitioner's blocks, soonest first; clinic B's absent
6.  GET ...?upcoming=1
    → past blocks excluded
7.  DELETE /blocked-times/{id}
    → 204, row gone
8.  INTEGRATION: create block 10:00-12:00 local, then POST /bookings at 11:00
    → 422; DELETE the block, POST again → 201
    (proves "Blocks prevent bookings" end to end)
9.  Block 09:45-10:15 → slots 09:30, 10:00 unavailable, 09:00 and 10:30 still free
    (non-grid-aligned block, the case removeBlockedSlots was written for)
10. Cross-clinic: GET/POST on clinic B's practitioner → 403, nothing stored;
    DELETE clinic B's block → 403, block still exists
11. Logged-out request to any route → redirect to /login
```

Run: `php artisan test --filter=BlockedTimeTest`

---

## Success Criteria

✅ Owner can create, list, and delete blocks for own clinic's practitioners
✅ A block makes overlapping slots unbookable (checked through `POST /bookings`)
✅ Deleting a block makes the slots bookable again
✅ Creating a block over existing bookings warns (count) without cancelling them
✅ Other clinics' data cannot be read or changed
✅ All new tests pass (8 Vite-manifest failures in the full suite are unrelated)

---

## What This Task Deliberately Does NOT Do

- **No update endpoint** — delete + recreate.
- **No auto-cancel / notification of conflicting bookings** — needs Phase 3
  (WhatsApp). For now the UI shows the `conflicting_bookings` count.
- **No recurring blocks** (e.g. "every Friday 12:00-13:00") — that is what
  `schedules` are for; model it as a schedule gap if needed later.
- **No whole-clinic block** (all practitioners at once, e.g. public holiday) —
  the table is per practitioner. The UI could loop over practitioners; a
  `clinic_id` block type is a possible later change.
- **No Policy/trait extraction** — see Decision #6.
- **No availability endpoint** — still unowned; Task 9/10 UIs need it
  (see Task 5 doc).

---

## Next Steps

After Task 6 is approved and implemented:
- Cleanup task: extract the clinic-ownership Policy and the shared test helper
  (after PRs #5/#6 are merged)
- Decide where `GET /availability/{practitioner}` lives
- Frontend tasks 7-12 can then start; they consume Tasks 4-6.
