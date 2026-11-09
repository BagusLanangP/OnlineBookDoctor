# Task 5: Booking API - Detailed Design

**Deliverable:** Create / list / update-status / cancel endpoints for bookings, scoped to the logged-in clinic, with slot validation via `AvailabilityService`
**Dependencies:** Task 1 (`Booking`/`Practitioner` models), Task 2 (`has.clinic`), Task 3 (`AvailabilityService`), Task 4 (routing + clinic-scoping pattern)
**Estimated Time:** 2-3 hours

---

## ⚠️ Decisions to Review Before Coding

### 1. Same routing approach as Task 4 (no `routes/api.php`)

Task 4 put JSON endpoints in `routes/web.php` inside the
`['auth', 'verified', 'has.clinic']` group. Task 5 repeats that. The original
plan's `/api/bookings` becomes `/bookings`. If you want `routes/api.php` for
the Phase 3 WhatsApp bot, decide now — this is the last cheap moment.

### 2. 🔴 The DB unique index conflicts with "cancel then rebook"

Task 1's migration has `unique(['practitioner_id', 'booked_time'])`. That
index counts **cancelled** rows too. But `AvailabilityService` deliberately
treats a cancelled slot as free (`->active()` in `removeBookedSlots`). Result:

```
1. Patient A books 10:00      → row (practitioner 1, 10:00, confirmed)
2. Patient A cancels          → same row, status = cancelled   (slot looks free)
3. Patient B books 10:00      → availability says OK, INSERT hits the unique
                                index → 500 error
```

The slot is offered as free but cannot be booked. Options:

| Option | How | Trade-off |
|---|---|---|
| **A (recommended)** | In `store`, inside a transaction, delete any *cancelled* row at the same `(practitioner, booked_time)` before inserting | No migration; keeps the unique index as the real race-condition guard. Loses the cancelled row's history for that slot. |
| B | New migration: drop the unique index, rely on app-level check only | Keeps history, but removes the DB safety net against two simultaneous requests. SQLite has no `lockForUpdate`, so tests can't prove the app check is race-safe. |
| C | `DELETE` hard-deletes instead of marking cancelled | Contradicts the plan ("marked cancelled"); also loses history. |

This doc implements **Option A**. Say so if you prefer B or C.

### 3. `booked_time` is sent in UTC (as in the plan)

Schedules are clinic-local (Task 4), bookings are UTC. The controller converts
the incoming UTC time to the clinic's local date to ask `AvailabilityService`
for that day's slots. A value with an offset (`2026-10-30T10:00:00+07:00`) is
also accepted — Carbon honours it.

### 4. `practitioner_id` in the body → 422, not 403

Task 4's practitioner came from the URL, so a foreign one was `403`. Here it
comes from the request body, and validation scopes it to the clinic with
`Rule::exists(...)->where('clinic_id', ...)`. A foreign or non-existent ID
both give `422` — the API doesn't reveal whether another clinic's practitioner
exists. `update`/`destroy` (booking from the URL) stay `403`, same as Task 4.

---

## Endpoints

```
POST   /bookings              create (validates slot availability)
GET    /bookings              list clinic's bookings (paginated, soonest first)
PUT    /bookings/{booking}    update status (completed | cancelled)
DELETE /bookings/{booking}    cancel (shortcut for status = cancelled)
```

## File Structure

```
app/Http/Controllers/
└── BookingController.php           (new)

app/Http/Requests/
├── StoreBookingRequest.php         (new)
└── UpdateBookingRequest.php        (new)

routes/web.php                      (modify: add booking routes)

tests/Feature/
└── BookingTest.php                 (new)
```

---

## Step 1: Form Requests

**File:** `app/Http/Requests/StoreBookingRequest.php`

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBookingRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'practitioner_id' => [
                'required',
                'integer',
                Rule::exists('practitioners', 'id')
                    ->where('clinic_id', $this->user()->clinic->id),
            ],
            'patient_name' => ['required', 'string', 'max:255'],
            'patient_phone' => ['required', 'regex:/^\d{8,15}$/'],
            'visit_reason' => ['required', 'string', 'max:255'],
            'booked_time' => ['required', 'date'],
        ];
    }
}
```

No `authorize()` override: clinic ownership is enforced by the `exists`
rule above, so there is nothing separate to authorize.

**Why `patient_phone` is digits-only (8-15):** matches the plan's example
(`628123456789`, no `+`) and the WhatsApp format Phase 3 needs. Stricter than
`string`, looser than a country-specific pattern.

**Why `booked_time` has no "must be in the future" rule here:** the future
check already happens through `AvailabilityService` (`removePastSlots`). A
past time is simply never in the slot list, so it fails the availability
check. One source of truth instead of two that could drift.

**File:** `app/Http/Requests/UpdateBookingRequest.php`

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateBookingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->route('booking')->practitioner->clinic_id === $this->user()->clinic->id;
    }

    public function rules(): array
    {
        return [
            'status' => ['required', Rule::in(['completed', 'cancelled'])],
        ];
    }
}
```

**Why `confirmed` is not an allowed value:** moving `cancelled → confirmed`
would re-occupy a slot without going through the availability check (and
could collide with someone who rebooked it). Status only moves forward from
`confirmed`. If "undo cancel" is ever needed, it should be a separate
endpoint that re-validates the slot.

---

## Step 2: Controller

**File:** `app/Http/Controllers/BookingController.php`

```php
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
```

**Why the availability check is in the controller, not the Form Request:**
it needs a service call plus the practitioner's timezone, which is business
logic rather than field validation. It still throws `ValidationException`, so
the client gets the same `422` JSON shape either way.

**Why `DELETE` soft-cancels:** the plan says "marked cancelled", and a booking
history is useful for the Phase 3 reminders/reports. Calling it twice is
harmless (idempotent).

**Known limit:** `index` uses `whereHas` on `practitioner`. Fine at MVP size;
if the bookings table grows large, add a denormalized `clinic_id` to
`bookings` later.

---

## Step 3: Routes

**Modify `routes/web.php`** — add inside the existing `has.clinic` group:

```php
use App\Http\Controllers\BookingController;

    Route::get('/bookings', [BookingController::class, 'index']);
    Route::post('/bookings', [BookingController::class, 'store']);
    Route::put('/bookings/{booking}', [BookingController::class, 'update']);
    Route::delete('/bookings/{booking}', [BookingController::class, 'destroy']);
```

---

## Testing Checklist

**File:** `tests/Feature/BookingTest.php` — `RefreshDatabase`. Same helper
pattern as `ScheduleTest` (clinic A + owner + practitioner; a second clinic B
for isolation tests). Create a schedule for the target weekday first, and pick
a **future** date (e.g. next Monday via `now()->next('Monday')`) so
`removePastSlots` doesn't filter it out. Slot times must be converted from
clinic-local (`Asia/Jakarta`, UTC+7) to UTC when sent.

```
1.  POST valid booking in an open slot
    → 201, row exists with status confirmed
2.  POST the same slot again
    → 422 (booked_time)
3.  POST outside schedule hours (e.g. 20:00 on a 09:00-17:00 day)
    → 422
4.  POST on a day with no schedule
    → 422
5.  POST in the past
    → 422
6.  POST missing patient_name / bad phone / missing visit_reason
    → 422 with the matching field errors
7.  Book, cancel (DELETE), then book the SAME slot again
    → second booking 201  ← proves Decision #2 (Option A) works
8.  GET /bookings
    → only this clinic's bookings, ordered by booked_time ascending;
      clinic B's bookings absent
9.  GET /bookings?status=cancelled
    → filter applied
10. PUT /bookings/{id} status=completed
    → 200, persisted
11. PUT with status=confirmed or garbage
    → 422
12. DELETE /bookings/{id}
    → 204, row still exists with status cancelled; second DELETE also 204
13. Cross-clinic: POST with clinic B's practitioner_id → 422;
    PUT/DELETE on clinic B's booking → 403, booking unchanged
14. Logged-out request to any route → redirect to /login
```

Run: `php artisan test --filter=BookingTest`

---

## Success Criteria

✅ Owner can create, list, update status, and cancel bookings for own clinic
✅ Only slots `AvailabilityService` reports as free can be booked
✅ Double-booking returns 422 (app check, with DB unique index as backstop)
✅ A cancelled slot can be booked again
✅ Other clinics' data cannot be read or changed
✅ All tests pass (the 8 existing Vite-manifest failures are unrelated; run
`npm run build` first to get a clean full-suite run)

---

## What This Task Deliberately Does NOT Do

- **No public/patient-facing booking endpoint.** Everything here requires a
  logged-in clinic owner. Patient booking (website form / WhatsApp bot) is
  Phase 3 and will need its own auth story (token or signed link).
- **No editing of booking details** (name, phone, time). Rescheduling =
  cancel + create new, which re-runs the availability check for free.
- **No notifications** (email/WhatsApp) — deferred to Phase 3 per the plan.
- **No booking-history preservation for rebooked slots** — Option A deletes
  the old cancelled row. Revisit with Option B if history matters.
- **No availability endpoint** (`GET /availability/{practitioner}`) — the
  plan lists it as a helper but no task owns it. The Bookings UI (Task 9)
  needs it to show free slots; consider adding it here or as Task 5b.

---

## Next Steps

After Task 5 is approved and implemented:
- Task 6: BlockedTime API (third repeat of the clinic-ownership check — by
  now extracting a shared Policy or trait is clearly worth it; also extract
  the repeated test helper `makeClinicWithPractitioner()` into a shared
  trait/`TestCase` method)
- Decide where the availability endpoint lives (see above)
