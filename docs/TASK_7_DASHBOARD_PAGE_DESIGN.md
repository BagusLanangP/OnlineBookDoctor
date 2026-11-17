# Task 7: Dashboard Page - Detailed Design

**Deliverable:** The `/dashboard` page shows today's bookings, the weekly schedule and the practitioner list for the logged-in clinic. Data arrives as Inertia props from a new `DashboardController`.
**Dependencies:** Task 1 (models), Task 2 (`has.clinic`), Task 4 (`Schedule`), Task 5 (`Booking`, UTC storage)
**Estimated Time:** 2-3 hours (first frontend task: most of the time is the React page and types)

---

## Sketch

```
GET /dashboard
      │
      ▼
DashboardController::index  (auth + verified + has.clinic)
      │   computes "today" in the CLINIC timezone, converts the bounds to UTC
      │
      ├── practitioners   clinic->practitioners
      ├── todayBookings   active bookings in [today 00:00, tomorrow 00:00) local
      └── weekSchedules   all schedules of those practitioners
      ▼
Inertia::render('Dashboard', props)
      ▼
Dashboard.tsx  ── 3 cards: Today's Bookings / Weekly Schedule / Practitioners
```

---

## ⚠️ Decisions to Review Before Coding

### 1. Inertia props, NOT `fetch('/api/...')`

The plan says "Data source: `/api/bookings`, `/api/schedules`". That does not
match the repo:

- There is no `routes/api.php` and no `/api` prefix; all routes are `web`.
- `/bookings` has no date filter (only `status`, `practitioner_id`) and is paginated by 20.
- Schedules exist only per practitioner (`/practitioners/{p}/schedules`); there is no "all schedules" endpoint.
- No endpoint lists practitioners.

Using the JSON endpoints would need 1 + N requests plus new filters. Instead the
dashboard route becomes a controller that queries the models directly and passes
props. No loading state, no extra endpoints, no change to Tasks 4-6.
"Real-time data" from the plan is satisfied as "fresh on every page load";
live polling is out of scope (see bottom).

### 2. "Today" is the clinic's day, not UTC's

`config/app.php` is `UTC`; `clinics.timezone` (default `Asia/Jakarta`) defines
the clinic's day. A Jakarta booking at 08:00 is stored as 01:00 UTC, so
`now()->startOfDay()` would assign bookings between 00:00-07:00 WIB to the wrong day.

```php
$tz    = $clinic->timezone;
$start = now($tz)->startOfDay()->utc();
$end   = now($tz)->addDay()->startOfDay()->utc();   // exclusive upper bound
```

### 3. Times are formatted on the server

Each booking is sent with a ready-made `time` (`"10:00"`, clinic-local) next to
the raw `booked_time`. This keeps timezone logic in one tested place (PHP)
instead of `Intl`/`toLocaleTimeString` in React, and a viewer's browser
timezone cannot shift the display.

### 4. "This week's schedule" = the recurring weekly template

`schedules` rows are a weekly pattern (`day_of_week` 0 = Sunday ... 6 =
Saturday, see `Schedule::getDayName()`), not dated events. So there is no date
filter: show all rows grouped by weekday, ordered **Monday → Sunday**
(`[1,2,3,4,5,6,0]`), and highlight today's weekday. The server sends
`todayDow = now($tz)->dayOfWeek` so React does not compute it.

### 5. Only active bookings, only today

`Booking::active()` (everything except `cancelled`) so `confirmed` and
`completed` both show. Upcoming days are Task 9's job (Bookings list).

### 6. Not in the plan, deliberately skipped

Blocked times on the dashboard (Task 10 owns that UI), clickable links to
other pages (those pages do not exist yet), and a "quick book" button.

---

## File Structure

```
app/Http/Controllers/
└── DashboardController.php        (new)

routes/web.php                     (modify: /dashboard closure → controller)

resources/js/Pages/
└── Dashboard.tsx                  (rewrite)

resources/js/types/
└── index.d.ts                     (modify: add Clinic, Practitioner, ...)

tests/Feature/
└── DashboardTest.php              (new)
```

---

## Step 1: Controller

**File:** `app/Http/Controllers/DashboardController.php`

```php
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
```

**Why `getRawOriginal` for schedule times:** `Schedule` casts `start_time` to
`datetime:H:i:s`, so the attribute is a Carbon on today's date. The raw DB
string (`"09:00:00"`) is what we want, trimmed to `"09:00"`. Verify with a
`dump()` once if your DB driver returns something different.

**N+1 check:** one query each for practitioners, bookings (+1 eager load),
schedules (+1 eager load). Fixed, independent of data size.

---

## Step 2: Route

**Modify `routes/web.php`** — replace the `/dashboard` closure inside the
`has.clinic` group (keep the name, Breeze redirects to `route('dashboard')`):

```php
use App\Http\Controllers\DashboardController;

    Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
```

---

## Step 3: Types

**Modify `resources/js/types/index.d.ts`** — append:

```ts
export interface Clinic {
    id: number;
    name: string;
    timezone: string;
}

export interface Practitioner {
    id: number;
    name: string;
    specialty: string | null;
}

export interface TodayBooking {
    id: number;
    time: string; // "10:00", clinic-local
    patient_name: string;
    visit_reason: string;
    status: 'confirmed' | 'completed' | 'cancelled';
    practitioner: string;
}

export interface WeekSchedule {
    id: number;
    day_of_week: number; // 0 = Sunday ... 6 = Saturday
    start_time: string; // "09:00"
    end_time: string;
    practitioner: string;
}
```

---

## Step 4: Page

**File:** `resources/js/Pages/Dashboard.tsx` (rewrite). Structure, not final markup:

```tsx
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Clinic, Practitioner, TodayBooking, WeekSchedule } from '@/types';
import { Head } from '@inertiajs/react';

const DAYS = [
    { dow: 1, label: 'Monday' }, { dow: 2, label: 'Tuesday' },
    { dow: 3, label: 'Wednesday' }, { dow: 4, label: 'Thursday' },
    { dow: 5, label: 'Friday' }, { dow: 6, label: 'Saturday' },
    { dow: 0, label: 'Sunday' },
]; // Decision #4: Monday first

interface Props {
    clinic: Clinic;
    practitioners: Practitioner[];
    todayBookings: TodayBooking[];
    weekSchedules: WeekSchedule[];
    todayDow: number;
}

export default function Dashboard({ clinic, practitioners, todayBookings, weekSchedules, todayDow }: Props) {
    // return <AuthenticatedLayout header=...> with a
    // <div className="grid grid-cols-1 gap-6 lg:grid-cols-3"> of three cards
}
```

Cards:

1. **Today's Bookings (n)**: list `time · patient_name — visit_reason`, small
   practitioner name and a status badge. Empty state: "No bookings today."
2. **This Week's Schedule**: for each `DAYS` entry, the rows for that weekday
   (`practitioner  09:00–17:00`); no rows → "Off". Highlight `todayDow`.
3. **Practitioners (n)**: name + specialty. Empty state: "No practitioners yet."

Mobile: single column below `lg`, no horizontal scroll, `px-4` gutter.
Use only Tailwind classes already used in the Breeze templates; no new packages.

---

## Testing Checklist

**File:** `tests/Feature/DashboardTest.php` — `RefreshDatabase`, same clinic /
practitioner helpers as `BookingTest` (clinic A + owner, clinic B for isolation).

Inertia page tests render the root Blade view, which calls `@vite` and fails
without a build (the 8 existing failures). Call `$this->withoutVite()` in
`setUp()` so these tests do not need `npm run build`.

```
1.  Today's booking shows, with local time
    → booking at 10:00 Asia/Jakarta (stored 03:00 UTC)
    → props todayBookings[0].time === "10:00"
2.  Timezone boundary
    → booking at 00:30 local today IS included (stored 17:30 UTC yesterday)
    → booking at 00:30 local tomorrow is NOT
    (use Carbon::setTestNow() so the test does not flake near midnight)
3.  Cancelled booking excluded; completed booking included
4.  Other clinic's bookings, schedules and practitioners never appear
5.  weekSchedules contains the clinic's schedules with "HH:MM" times
6.  todayDow matches the clinic-local weekday
    (setTestNow at 20:00 UTC Sunday = 03:00 Monday Jakarta → todayDow = 1)
7.  Clinic with no data → 200, empty arrays
8.  Logged-out → redirect to /login
9.  User without a clinic → 403 (EnsureUserHasClinic aborts, it does not redirect)
```

Assertion style:

```php
$this->actingAs($owner)->get('/dashboard')
    ->assertInertia(fn ($page) => $page
        ->component('Dashboard')
        ->has('todayBookings', 1)
        ->where('todayBookings.0.time', '10:00'));
```

Run: `php artisan test --filter=DashboardTest`, then the full suite to make
sure the Breeze auth tests (which redirect to `/dashboard`) still behave as before.

**Manual check** (the plan's "no errors in console / responsive"):
`composer run dev` (or `php artisan serve` + `npm run dev`), log in, open
`/dashboard`, check the browser console, then resize to ~375px width.

---

## Success Criteria

✅ `/dashboard` shows only the logged-in clinic's practitioners, schedules and today's bookings
✅ "Today" follows the clinic timezone, including the midnight boundary
✅ Cancelled bookings are hidden, empty states render, no console errors
✅ Layout stays usable at phone width
✅ `DashboardTest` passes; the rest of the suite is unchanged (8 Vite failures are unrelated)

---

## What This Task Deliberately Does NOT Do

- **No JSON/API endpoints** — props only (Decision #1).
- **No live updates / polling** — refresh the page, or use `router.reload({ only: [...] })` later.
- **No blocked-times display** — Task 10.
- **No navigation links or quick actions** — target pages come in Tasks 8-10.
- **No date picker** — the dashboard is always "today"; Task 9 covers date ranges.

---

## Next Steps

After Task 7:
- Task 8 (Schedule page) will need the practitioner list. Reuse the `Practitioner` type added here, and decide whether pages get practitioners via props (like here) or a shared Inertia prop in `HandleInertiaRequests`.
- Task 9 (Bookings list) needs a date-range filter on `GET /bookings`, which does not exist yet.
