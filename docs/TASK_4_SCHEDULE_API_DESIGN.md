# Task 4: Schedule API - Detailed Design

**Deliverable:** CRUD endpoints for a practitioner's weekly schedule, scoped to the logged-in clinic
**Dependencies:** Task 1 (`Schedule`/`Practitioner` models), Task 2 (auth + `has.clinic` middleware)
**Estimated Time:** 1.5-2 hours

---

## ⚠️ Design Change from Original Plan — Please Review

`PHASE_2_DETAILED_PLAN.md` assumed a separate `routes/api.php` with flat
endpoints (`POST /api/schedules`, `GET /api/schedules/{practitioner_id}`
returning *all* schedules for that practitioner despite the URL looking like
a single-resource lookup). **That no longer fits this app.**

**Why:** This project has no `routes/api.php` — `bootstrap/app.php` only
registers `web`. Auth is session-based (Breeze + Inertia), not token-based,
so there's no reason to stand up a separate stateless API stack. The
frontend (Task 8's Schedule UI) will call these endpoints the same way
Inertia pages already call `ProfileController` — same-origin `axios`
requests inside the authenticated session.

**New approach:**
- Routes live in `routes/web.php`, inside the **same**
  `['auth', 'verified', 'has.clinic']` group that already protects
  `/dashboard`. No new middleware needed.
- Controller methods return JSON directly (`response()->json(...)`), not
  `Inertia::render()`. `bootstrap/app.php` already has
  `shouldRenderJsonWhen` set to trigger on `expectsJson()`, which `axios`
  satisfies automatically — so validation/auth errors come back as JSON
  too, no extra config required.
- Routes are nested by resource relationship instead of flat, since a
  schedule only ever makes sense in the context of its practitioner:
  `/practitioners/{practitioner}/schedules` for list/create,
  `/schedules/{schedule}` for update/delete (standard "shallow nesting").

```
Before (original plan):                 After (this design):
routes/api.php                          routes/web.php (existing has.clinic group)
POST   /api/schedules                   POST   /practitioners/{practitioner}/schedules
GET    /api/schedules/{practitioner_id} GET    /practitioners/{practitioner}/schedules
PUT    /api/schedules/{id}              PUT    /schedules/{schedule}
DELETE /api/schedules/{id}              DELETE /schedules/{schedule}
```

If you'd rather keep a dedicated `routes/api.php` (e.g. because Phase 3's
WhatsApp bot will need token auth anyway), say so now — it's a bigger
change and worth deciding before Task 5/6 repeat this pattern.

---

## File Structure

```
app/Http/Controllers/
└── ScheduleController.php          (new)

app/Http/Requests/
├── StoreScheduleRequest.php        (new)
└── UpdateScheduleRequest.php       (new)

routes/web.php                      (modify: add schedule routes)

tests/Feature/
└── ScheduleTest.php                (new)
```

---

## Step 1: Form Requests — authorization + validation together

**Purpose:** Every schedule belongs to a practitioner, who belongs to a
clinic. A user must only touch schedules under their own clinic. Rather
than repeating that check in every controller method, it lives once in
each Form Request's `authorize()` — Laravel calls this automatically
before `rules()` and turns a `false` into an automatic `403`.

**Why not a Policy class:** no `app/Policies/` directory exists yet
anywhere in this app — adding the first one just for this would be an
abstraction with no precedent to justify it yet. Revisit if Task 5/6 need
the same clinic-ownership check on `Booking`/`BlockedTime` too; at that
point a shared trait or base Policy is worth it.

**File:** `app/Http/Requests/StoreScheduleRequest.php`

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->route('practitioner')->clinic_id === $this->user()->clinic->id;
    }

    public function rules(): array
    {
        $practitionerId = $this->route('practitioner')->id;

        return [
            'day_of_week' => [
                'required',
                'integer',
                'between:0,6',
                Rule::unique('schedules')->where('practitioner_id', $practitionerId),
            ],
            'start_time' => ['required', 'date_format:H:i,H:i:s'],
            'end_time' => ['required', 'date_format:H:i,H:i:s', 'after:start_time'],
        ];
    }
}
```

**Why `Rule::unique(...)->where('practitioner_id', ...)`:** the DB has a
compound unique index on `(practitioner_id, day_of_week)` (from Task 1).
Scoping the validation rule the same way means a duplicate day for *this*
practitioner fails validation with a clean 422 before it ever reaches the
DB constraint.

**File:** `app/Http/Requests/UpdateScheduleRequest.php`

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->route('schedule')->practitioner->clinic_id === $this->user()->clinic->id;
    }

    public function rules(): array
    {
        return [
            'start_time' => ['required', 'date_format:H:i,H:i:s'],
            'end_time' => ['required', 'date_format:H:i,H:i:s', 'after:start_time'],
        ];
    }
}
```

**Why update can't change `day_of_week`:** matches the original plan's PUT
example (only `start_time`/`end_time` in the payload). Changing which day
a schedule applies to is really "delete this row, create a new one" —
allowing it here would mean re-running the uniqueness check against a
*different* day than the one on the route, which belongs back on `store`.
Keeps `update` simple: same day, new hours.

---

## Step 2: Controller

**File:** `app/Http/Controllers/ScheduleController.php`

```php
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
```

**Why `index`/`destroy` check clinic ownership inline instead of a Form
Request:** they take no validated input, so a Form Request would exist
only to carry `authorize()` — a thin wrapper with no `rules()`. The
one-line `abort_unless` says the same thing without the extra file.

---

## Step 3: Routes

**Modify `routes/web.php`** — add inside the existing `has.clinic` group:

```php
use App\Http\Controllers\ScheduleController;

Route::middleware(['auth', 'verified', 'has.clinic'])->group(function () {
    Route::get('/dashboard', function () {
        return Inertia::render('Dashboard', [
            'clinic' => auth()->user()->clinic,
        ]);
    })->name('dashboard');

    Route::get('/practitioners/{practitioner}/schedules', [ScheduleController::class, 'index']);
    Route::post('/practitioners/{practitioner}/schedules', [ScheduleController::class, 'store']);
    Route::put('/schedules/{schedule}', [ScheduleController::class, 'update']);
    Route::delete('/schedules/{schedule}', [ScheduleController::class, 'destroy']);
});
```

---

## Testing Checklist

**File:** `tests/Feature/ScheduleTest.php` — `RefreshDatabase`, log in as a
seeded clinic owner (`actingAs`) before each case.

```
1. POST /practitioners/{id}/schedules with valid payload
   → 201, row exists in DB
2. PUT /schedules/{id} with new start_time/end_time
   → 200, row updated
3. DELETE /schedules/{id}
   → 204, row gone from DB
4. POST with day_of_week = 7
   → 422
5. POST with start_time >= end_time
   → 422
6. POST with a day_of_week that already has a schedule for that practitioner
   → 422
7. POST/PUT/DELETE targeting a practitioner/schedule under a DIFFERENT
   clinic's account → 403 (this is the one the original plan's test list
   didn't cover — it's the whole reason authorize() exists)
8. Logged-out request to any of these routes → redirected to /login
   (Breeze's existing `auth` middleware, not new behavior, but worth one
   assertion so a future refactor can't silently drop it)
```

Manual check in `tinker` after `migrate:fresh --seed`:

```php
$practitioner = \App\Models\Practitioner::first();
$practitioner->schedules()->create([
    'day_of_week' => 2,
    'start_time' => '09:00:00',
    'end_time' => '17:00:00',
]);
$practitioner->schedules; // should include the new row
```

---

## Success Criteria

✅ Clinic owner can create/update/delete schedules for their own practitioners
✅ `day_of_week` out of range, `start_time >= end_time`, and duplicate
(practitioner, day_of_week) all return 422
✅ Acting on another clinic's practitioner/schedule returns 403
✅ Logged-out access redirects to `/login`
✅ All tests pass

---

## What This Task Deliberately Does NOT Do

- No bulk "set my whole week at once" endpoint — one day per request,
  matching the one-row-per-day DB shape from Task 1. A bulk endpoint is a
  reasonable Task 8 (Schedule UI) addition once we know what the UI
  actually needs to send.
- No overlap validation against existing `Booking`s when a schedule's
  hours shrink (e.g. narrowing 09:00-17:00 to 09:00-12:00 after a 14:00
  booking already exists). `AvailabilityService` (Task 3) only reads
  schedules going forward; it doesn't retroactively invalidate past
  writes. Decide in a later task whether shrinking a schedule should warn
  about or block orphaned bookings.
- No Policy class (see Step 1). Revisit if Task 5/6 need the identical
  clinic-ownership check.

---

## Next Steps

After Task 4 is approved and implemented:
- Task 5: Booking API (will reuse the same clinic-scoping pattern, plus
  call into `AvailabilityService` from Task 3 to validate requested slots)
- Task 6: BlockedTime API (same clinic-scoping pattern again — worth
  watching whether three repeats of `abort_unless($x->clinic_id === ...)`
  justifies extracting the Policy class deferred in Step 1)
