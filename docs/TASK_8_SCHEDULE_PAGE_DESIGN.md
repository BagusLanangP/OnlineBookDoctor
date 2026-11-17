# Task 8: Schedule Management Page - Detailed Design

**Deliverable:** A page where the owner picks a practitioner and sets the working hours for each weekday (Mon-Sun), with a visual weekly preview and one "Save" button.
**Dependencies:** Task 4 (`schedules` table + unique `(practitioner_id, day_of_week)`), Task 7 (`Practitioner` type, `DAYS` constant, Inertia-props pattern)
**Estimated Time:** 3-4 hours (one small backend endpoint, one React page, tests)

---

## Sketch

```
GET /schedules/edit?practitioner=2
      │
      ▼
ScheduleWeekController::edit  ── practitioners (dropdown) + selected practitioner's schedules
      ▼
Schedules/Edit.tsx
 ┌──────────────────────────────────────────────┐
 │ Practitioner: [ Dr. Ahmad Wijaya        ▾ ]   │
 │                                              │
 │ ☑ Monday    [09:00] – [17:00]   ▕██████████▏ │
 │ ☑ Tuesday   [09:00] – [17:00]   ▕██████████▏ │
 │ ☐ Wednesday  Off                             │
 │ ...                                          │
 │ ☐ Sunday     Off                             │
 │                          [ Save ]  ✓ Saved   │
 └──────────────────────────────────────────────┘
      │ Save
      ▼
PUT /practitioners/{p}/schedules   (one request, whole week)
      ▼
ScheduleWeekController::update ── DB transaction: delete unchecked days, upsert checked days
      ▼
redirect back → page re-renders with saved data
```

---

## ⚠️ Decisions to Review Before Coding

### 1. One bulk "save week" endpoint, not 7 calls to the Task 4 endpoints

The plan says "Save to /api/schedules". Task 4 gave us per-row JSON endpoints
(`POST` one day, `PUT` start/end only, `DELETE`). Saving a week with those means
up to 7 requests: create for newly ticked days, update for changed ones, delete
for unticked ones. Problems: not atomic (a failure on day 4 leaves the week half
saved), and the page must diff old vs new state.

This doc adds **one** endpoint that takes the full week and makes the database match it:

```
PUT /practitioners/{practitioner}/schedules
{ "schedules": [ {"day_of_week":1,"start_time":"09:00","end_time":"17:00"}, ... ] }
```

Only **working** days are sent; days not in the list are deleted. A transaction
makes it all-or-nothing. The Task 4 JSON endpoints stay untouched (they are
tested and may be useful for other clients).

### 2. Inertia page + Inertia-style save (redirect back), not axios + JSON

Same reasoning as Task 7: no `/api`, no JSON needed. The page is an Inertia
component, saving uses `useForm().put()`, and the controller answers
`back()`. Do **not** point `useForm` at the Task 4 JSON endpoints: Inertia
requires an Inertia/redirect response and would show an error modal on JSON.

### 3. New controller, not extra methods on `ScheduleController`

`ScheduleController` is purely JSON. The page + bulk save live in a new
`ScheduleWeekController` so each controller has one response style.

### 4. Selected practitioner = a query string, default = first by name

`GET /schedules/edit?practitioner={id}`. The dropdown does an Inertia
`router.get` with that param. A practitioner id from another clinic → `403`
(same convention as Tasks 4-6). No `?practitioner` → first practitioner
(alphabetical). Clinic with no practitioners → page renders an empty state.

### 5. Times are clinic-local, no UTC conversion

Schedules store plain `HH:MM` in the clinic's local time (unlike
`booked_time` / blocked times, which are UTC). The page sends exactly what the
`<input type="time">` gives. The controller normalises to `H:i:s` before
saving (the Task 4 requests accept `H:i` too, which would store `"09:00"` in
one row and `"09:00:00"` in another) and trims to `HH:MM` when sending to the page.

### 6. Turning a day off does NOT cancel existing bookings

Same stance as blocked times (Task 6, Option A): bookings already made on a day
that is later switched off stay `confirmed`; `AvailabilityService` simply stops
offering new slots. No warning count in this task (see "Not done").

### 7. One split per day (no lunch breaks)

The unique index allows one row per `(practitioner, day)`, so a day is one
continuous range. A lunch gap would need a schema change; out of scope.

### 8. Extract the `DAYS` constant

Task 7 defined `DAYS` (Monday-first, `dow` 0 = Sunday) inside `Dashboard.tsx`.
Move it to `resources/js/lib/days.ts` and import it in both pages instead of
copying it. This touches `Dashboard.tsx` by one import line only.

---

## File Structure

```
app/Http/Controllers/
└── ScheduleWeekController.php        (new)

app/Http/Requests/
└── SyncSchedulesRequest.php          (new)

routes/web.php                        (modify: 2 routes in has.clinic group)

resources/js/lib/
└── days.ts                           (new: shared DAYS)

resources/js/Pages/
├── Schedules/Edit.tsx                (new)
└── Dashboard.tsx                     (modify: import DAYS from lib/days)

resources/js/Layouts/
└── AuthenticatedLayout.tsx           (modify: add "Schedules" nav link, desktop + responsive)

resources/js/types/index.d.ts         (modify: add ScheduleRow)

tests/Feature/
└── ScheduleWeekTest.php              (new)
```

---

## Step 1: Form Request

**File:** `app/Http/Requests/SyncSchedulesRequest.php`

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SyncSchedulesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->route('practitioner')->clinic_id === $this->user()->clinic->id;
    }

    public function rules(): array
    {
        return [
            'schedules' => ['present', 'array', 'max:7'],          // [] = every day off
            'schedules.*.day_of_week' => ['required', 'integer', 'between:0,6', 'distinct'],
            'schedules.*.start_time' => ['required', 'date_format:H:i,H:i:s'],
            'schedules.*.end_time' => ['required', 'date_format:H:i,H:i:s', 'after:schedules.*.start_time'],
        ];
    }
}
```

`distinct` protects the unique index (two rows for the same day would otherwise
overwrite each other silently). Verify with a test that `after:schedules.*.start_time`
compares the **same row** (Laravel substitutes the `*` with the row index).

---

## Step 2: Controller

**File:** `app/Http/Controllers/ScheduleWeekController.php`

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\SyncSchedulesRequest;
use App\Models\Practitioner;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ScheduleWeekController extends Controller
{
    public function edit(Request $request): Response
    {
        $clinic = $request->user()->clinic;

        $practitioners = $clinic->practitioners()
            ->orderBy('name')
            ->get(['id', 'name', 'specialty']);

        // Decision #4
        if ($request->filled('practitioner')) {
            $selected = $practitioners->firstWhere('id', $request->integer('practitioner'));
            abort_if($selected === null, 403);
        } else {
            $selected = $practitioners->first();
        }

        $schedules = $selected
            ? $selected->schedules()->orderBy('day_of_week')->get()->map(fn ($s) => [
                'day_of_week' => $s->day_of_week,
                'start_time' => substr((string) $s->getRawOriginal('start_time'), 0, 5),
                'end_time' => substr((string) $s->getRawOriginal('end_time'), 0, 5),
            ])
            : [];

        return Inertia::render('Schedules/Edit', [
            'practitioners' => $practitioners,
            'practitioner' => $selected,
            'schedules' => $schedules,
        ]);
    }

    public function update(SyncSchedulesRequest $request, Practitioner $practitioner): RedirectResponse
    {
        $days = $request->validated('schedules');

        DB::transaction(function () use ($practitioner, $days) {
            // Decision #1: days not sent are switched off. (whereNotIn on an
            // empty list matches every row, which is what "all off" means.)
            $practitioner->schedules()
                ->whereNotIn('day_of_week', collect($days)->pluck('day_of_week'))
                ->delete();

            foreach ($days as $day) {
                $practitioner->schedules()->updateOrCreate(
                    ['day_of_week' => $day['day_of_week']],
                    [
                        // Decision #5: one stored format.
                        'start_time' => Carbon::parse($day['start_time'])->format('H:i:s'),
                        'end_time' => Carbon::parse($day['end_time'])->format('H:i:s'),
                    ],
                );
            }
        });

        return back();
    }
}
```

---

## Step 3: Routes

**Modify `routes/web.php`** — inside the `has.clinic` group:

```php
use App\Http\Controllers\ScheduleWeekController;

    Route::get('/schedules/edit', [ScheduleWeekController::class, 'edit'])->name('schedules.edit');
    Route::put('/practitioners/{practitioner}/schedules', [ScheduleWeekController::class, 'update'])->name('schedules.update');
```

`PUT /practitioners/{p}/schedules` shares its URL with Task 4's `GET`/`POST`
(different methods, no clash). `GET /schedules/edit` cannot clash with
`PUT|DELETE /schedules/{schedule}` (different method).

---

## Step 4: Frontend

### 4a. Shared constant: `resources/js/lib/days.ts`

```ts
export const DAYS = [
    { dow: 1, label: 'Monday' }, { dow: 2, label: 'Tuesday' },
    { dow: 3, label: 'Wednesday' }, { dow: 4, label: 'Thursday' },
    { dow: 5, label: 'Friday' }, { dow: 6, label: 'Saturday' },
    { dow: 0, label: 'Sunday' },
]; // Monday first, dow 0 = Sunday (matches Schedule::getDayName)
```

In `Dashboard.tsx` delete the local `DAYS` and `import { DAYS } from '@/lib/days';`.

### 4b. Types (append to `index.d.ts`)

```ts
export interface ScheduleRow {
    day_of_week: number;
    start_time: string; // "09:00"
    end_time: string;
}
```

### 4c. Page: `resources/js/Pages/Schedules/Edit.tsx`

Structure, not final markup:

```tsx
interface Props {
    practitioners: Practitioner[];
    practitioner: Practitioner | null;
    schedules: ScheduleRow[];
}

export default function Edit({ practitioners, practitioner, schedules }: Props) {
    // header + <Head title="Schedules" />
    // no practitioner → empty state card ("No practitioners yet.")
    // else: dropdown + <WeekForm key={practitioner.id} .../>
}
```

- **Dropdown:** `onChange` → `router.get(route('schedules.edit'), { practitioner: id })`.
- **`WeekForm` (child, `key={practitioner.id}`):** the `key` remounts the form
  when the practitioner changes, so `useForm` re-initialises from the new props.
  State: seven `{ dow, working, start_time, end_time }` entries in `DAYS`
  order; days present in `schedules` start as `working: true`, the rest as
  `working: false` with default `09:00`–`17:00`.
- **Per day row:** checkbox (`Components/Checkbox`), label, two `<input type="time">`
  (shown only when working, otherwise "Off"), and a preview bar.
- **Preview bar:** a `div` inside a full-width track representing 00:00-24:00;
  `left = start/1440`, `width = (end-start)/1440` in `%`. Computed from the
  **form state**, so it updates live while typing.
- **Client validation:** if `end <= start` show an inline message and disable
  Save. Server validation stays the source of truth.
- **Submit:**
  ```tsx
  form.transform((d) => ({
      schedules: d.days.filter((x) => x.working).map(({ dow, start_time, end_time }) =>
          ({ day_of_week: dow, start_time, end_time })),
  })).put(route('schedules.update', practitioner.id), { preserveScroll: true });
  ```
- **Feedback:** disable the button while `form.processing`; show "Saved ✓" while
  `form.recentlySuccessful`; show errors from `form.errors`.
- **Error index trap:** server errors are keyed `schedules.0.end_time`, where `0`
  is the index in the **filtered** (working-only) list, not the day. Build the same
  filtered list when rendering, map index → day, and show each error under its day.
- **Mobile:** each day is a stacked block (`flex-col sm:flex-row`), time inputs
  `w-full sm:w-auto`, no horizontal scroll at 375px.

### 4d. Navigation

In `AuthenticatedLayout.tsx` add a "Schedules" `NavLink` (desktop) and
`ResponsiveNavLink` (mobile) next to Dashboard, `href={route('schedules.edit')}`,
`active={route().current('schedules.edit')}`. Optionally link from the Dashboard
schedule card.

---

## Testing Checklist

**File:** `tests/Feature/ScheduleWeekTest.php` — `RefreshDatabase`, `withoutVite()` in
`setUp()`, same clinic A / clinic B helpers as `DashboardTest`.

```
edit (page props)
1.  No ?practitioner → defaults to first practitioner by name, with its schedules as "HH:MM"
2.  ?practitioner={own id} → that practitioner's schedules only
3.  ?practitioner={other clinic's id} → 403
4.  Clinic with no practitioners → 200, practitioner = null, empty arrays

update (bulk save)
5.  PUT 3 working days on an empty week → 3 rows stored as "HH:MM:SS", redirect back
6.  PUT changes Monday's hours + drops Tuesday + adds Friday
    → Monday updated (same row id), Tuesday deleted, Friday created
7.  PUT {"schedules": []} → every schedule of that practitioner deleted
8.  PUT only touches that practitioner (other practitioner's rows unchanged)
9.  Existing booking on a day that is switched off stays 'confirmed'
10. Validation: end <= start on the 2nd row → 422/redirect with error on
    schedules.1.end_time, and NOTHING saved (transaction / validation first)
11. Validation: duplicate day_of_week, day 7, garbage time, 8 rows, missing
    "schedules" key → errors, nothing saved
12. PUT for other clinic's practitioner → 403, nothing changed

access
13. Logged-out → redirect to /login (both routes)
14. User without a clinic → 403

integration
15. After PUT, AvailabilityService offers slots on the new hours and none on a
    removed day (proves the page actually controls bookability)
```

Inertia form requests: send with `->put(url, data)` and assert
`assertSessionHasErrors('schedules.1.end_time')` / `assertRedirect()`; use
`->from('/schedules/edit')` so `back()` has somewhere to go.

Run: `php artisan test --filter=ScheduleWeekTest`, then the full suite;
also `npx tsc --noEmit`.

**Manual check** (browser, `php artisan serve` + `npm run dev`; log in as the
seeded owner `admin@klinikmajujaya.test` / `password`):
1. `/schedules/edit` shows Dr. Ahmad with Mon-Sat checked, Sunday off.
2. Switch practitioner → form shows Dr. Siti's Mon-Fri 08:00-16:00.
3. Untick Saturday, change Monday to 10:00-15:00, Save → "Saved ✓"; reload → persisted; Dashboard weekly card reflects it.
4. Set end before start → inline error, Save disabled.
5. 375px width: no horizontal scroll, controls usable; console has no errors.

---

## Success Criteria

✅ Owner can view and change the weekly schedule of any practitioner in their clinic
✅ Save is atomic: invalid input saves nothing
✅ Unticked days are removed; changed days keep working; stored times are normalised
✅ Visual preview matches the form state; save gives visible feedback
✅ Other clinics' practitioners cannot be viewed or changed (403)
✅ Mobile-friendly; no console errors
✅ New tests pass (8 Vite failures in the full suite disappear after `npm run build`, otherwise unrelated)

---

## What This Task Deliberately Does NOT Do

- **No practitioner create/edit/delete** — there is still no endpoint or UI for
  practitioners (only the seeder creates them). The empty state of this page
  therefore has nothing to link to. **This gap blocks real onboarding: decide who owns it** (a small "Practitioners CRUD" task before the frontend phase ends).
- **No lunch breaks / multiple ranges per day** — needs schema change (Decision #7).
- **No warning about bookings on a day switched off** — a count like Task 6's
  `conflicting_bookings` is a possible follow-up.
- **No copy-to-all-days shortcut** ("same hours Mon-Fri") — nice UX, not required.
- **No changes to Task 4's JSON endpoints.**

---

## Next Steps

After Task 8:
- Task 9 (Bookings list) needs a date-range filter on `GET /bookings` (still missing) and a practitioner dropdown, which can reuse the practitioner props pattern from here. Consider moving `practitioners` into a shared Inertia prop in `HandleInertiaRequests` once three pages need it.
- Fix `ClinicSeeder` (stores 10:00 UTC instead of 10:00 clinic-local) in its own small PR.
