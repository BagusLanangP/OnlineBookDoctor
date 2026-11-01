# Task 2: Authentication & Clinic Guard - Detailed Design

**Deliverable:** Link logged-in Users (Breeze) to a Clinic, with middleware enforcing it  
**Dependencies:** Task 1 (Clinic, Practitioner, Schedule, Booking, BlockedTime models)  
**Estimated Time:** 1-2 hours

---

## ⚠️ Design Change from Original Plan — Please Review

The original `PHASE_2_PLAN.md` assumed `Clinic` itself would be the login identity
(WhatsApp number + password, custom guard). **That's no longer the right call.**

**Why:** We already switched to Laravel Breeze, which ships a fully working,
tested auth system on the `User` model — login, register, password reset, email
verification, CSRF, session handling. It's live right now (`/login` renders and
works). Building a second, parallel auth system on `Clinic` would mean
re-solving password hashing, session guards, and reset flows that Breeze
already solved, for no real benefit.

**New approach:** Keep `User` (Breeze) as the thing that logs in. Add a
one-to-one link: **one `User` owns one `Clinic`**. Everywhere we need "the
current clinic," we read it off `$request->user()->clinic`.

```
Before (original plan):          After (this design):
┌──────────┐                     ┌──────────┐        ┌──────────┐
│  Clinic  │ ← logs in           │   User   │ ← logs in (Breeze)
│ password │                     │ password │
└──────────┘                     └────┬─────┘
                                       │ hasOne
                                       ▼
                                  ┌──────────┐
                                  │  Clinic  │ ← business data
                                  │ (no auth)│
                                  └──────────┘
```

If this isn't what you want (e.g., you want clinics to log in with WhatsApp
number instead of email), say so now — it changes several files below.

---

## File Structure

```
database/migrations/
└── 2026_11_0X_000000_add_user_id_to_clinics_table.php   (modify clinics table)

app/Models/
├── User.php          (modify: add clinic() relationship)
└── Clinic.php         (modify: add user() relationship, user_id fillable)

app/Http/Middleware/
└── EnsureUserHasClinic.php   (new)

bootstrap/app.php       (modify: register middleware alias)

database/seeders/
└── ClinicSeeder.php    (modify: create owning User first)

routes/web.php          (modify: protect dashboard with new middleware)
```

---

## Step 1: Migration — link `clinics` to `users`

**Purpose:** Every clinic needs exactly one owning user account. We add
`user_id` to `clinics` (not the other way around) because `Clinic` is the
dependent record — it doesn't exist without an owner, while a `User` could
theoretically exist without a clinic yet (e.g., mid-onboarding).

**File:** `database/migrations/2026_11_0X_000000_add_user_id_to_clinics_table.php`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clinics', function (Blueprint $table) {
            $table->foreignId('user_id')
                  ->after('id')
                  ->unique()
                  ->constrained('users')
                  ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('clinics', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
        });
    }
};
```

**Why `unique()`:** enforces one-to-one — a `User` can't own two clinics, and
two `Users` can't own the same clinic.

**Why `cascadeOnDelete()`:** deleting a user (owner) deletes their clinic and,
by the Task 1 cascade chain, all practitioners/schedules/bookings/blocked
times under it. Matches "this account owns this clinic" semantics.

---

## Step 2: Model relationships

**Purpose:** Let code say `$user->clinic` and `$clinic->user` naturally.

**Modify `app/Models/Clinic.php`** — add `user_id` to fillable, add relation:

```php
protected $fillable = [
    'user_id',
    'name',
    'phone',
    'whatsapp_number',
    'timezone',
];

public function user(): BelongsTo
{
    return $this->belongsTo(User::class);
}
```

**Modify `app/Models/User.php`** — add relation:

```php
public function clinic(): HasOne
{
    return $this->hasOne(Clinic::class);
}
```

(Needs `use Illuminate\Database\Eloquent\Relations\HasOne;` import.)

---

## Step 3: Middleware — `EnsureUserHasClinic`

**Purpose:** Every Phase 2 page (dashboard, schedules, bookings, settings)
assumes `auth()->user()->clinic` exists. Rather than null-checking in every
controller, one middleware guarantees it and gives controllers a clean
`$request->user()->clinic` to call. If a logged-in user somehow has no
clinic yet (shouldn't happen in Phase 2's seeded-data flow, but matters once
registration is self-serve), they get redirected instead of a 500 error.

**File:** `app/Http/Middleware/EnsureUserHasClinic.php`

```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserHasClinic
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->clinic) {
            abort(403, 'No clinic is associated with this account.');
        }

        return $next($request);
    }
}
```

**Why `abort(403)` and not a redirect:** Phase 2 has no "create your clinic"
onboarding page yet — every clinic is created via the seeder. A redirect
target (`/onboarding`) would be a dead link. 403 is correct until that page
exists; revisit this in a later phase if self-serve signup is added.

**Register the alias** in `bootstrap/app.php`, inside `withMiddleware`:

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias([
        'has.clinic' => \App\Http\Middleware\EnsureUserHasClinic::class,
    ]);
})
```

---

## Step 4: Protect routes

**Purpose:** Apply the new check alongside Breeze's existing `auth` middleware.

**Modify `routes/web.php`** — change the dashboard route group:

```php
Route::middleware(['auth', 'verified', 'has.clinic'])->group(function () {
    Route::get('/dashboard', function () {
        return Inertia::render('Dashboard', [
            'clinic' => auth()->user()->clinic,
        ]);
    })->name('dashboard');
});
```

Later tasks (3-6) will add their routes inside this same group.

---

## Step 5: Update the seeder — create the owning User first

**Purpose:** `ClinicSeeder` currently creates a `Clinic` with no owner, which
now violates the `user_id` NOT NULL constraint. Fix: create a `User` (the
clinic owner's login) first, then attach the clinic to it.

**Modify `database/seeders/ClinicSeeder.php`** — replace the clinic-creation
block:

```php
use App\Models\User;
use Illuminate\Support\Facades\Hash;

// ... inside run():

$owner = User::create([
    'name' => 'Klinik Maju Jaya Admin',
    'email' => 'admin@klinikmajujaya.test',
    'password' => Hash::make('password'),
]);

$clinic = Clinic::create([
    'user_id' => $owner->id,
    'name' => 'Klinik Maju Jaya',
    'phone' => '628123456789',
    'whatsapp_number' => '628123456789',
    'timezone' => 'Asia/Jakarta',
]);
```

(Rest of the seeder — practitioners, schedules, bookings, blocked time —
stays unchanged.)

**Demo login after this change:**
```
email: admin@klinikmajujaya.test
password: password
```

---

## Testing Checklist

Run `php artisan migrate:fresh --seed`, then in `php artisan tinker`:

```php
// Relationship works both directions
$user = User::where('email', 'admin@klinikmajujaya.test')->first();
$user->clinic->name;              // "Klinik Maju Jaya"
$user->clinic->user->id === $user->id;  // true

// Unique constraint: can't attach a second clinic to same user
Clinic::create([
    'user_id' => $user->id,
    'name' => 'Second Clinic',
    'phone' => '628000000000',
    'whatsapp_number' => '628000000000',
]); // should throw unique constraint violation

// Cascade: deleting the user removes the clinic
$uid = $user->id;
$user->delete();
Clinic::where('user_id', $uid)->count(); // 0
```

Manual browser check:
1. Visit `/login`, sign in with `admin@klinikmajujaya.test` / `password`
2. Should reach `/dashboard` without error
3. Log out, try visiting `/dashboard` directly → redirected to `/login` (Breeze's `auth` middleware)

---

## Success Criteria

✅ Migration adds `user_id` to `clinics`, unique + FK + cascade  
✅ `$user->clinic` and `$clinic->user` both resolve correctly  
✅ `EnsureUserHasClinic` middleware blocks access when no clinic is linked  
✅ Seeder creates a working login (`admin@klinikmajujaya.test` / `password`)  
✅ `/dashboard` loads for the seeded user and shows clinic data  
✅ Logged-out access to `/dashboard` redirects to `/login`  

---

## What This Task Deliberately Does NOT Do

- No "sign up as a new clinic" flow (Breeze's `/register` creates a bare
  `User` with no clinic — would currently hit the 403 from Step 3). Adding
  clinic-creation-on-register is a reasonable Phase 2.5/3 task, not this one.
- No WhatsApp-number-as-login. Login stays email+password via Breeze.
- No role/permission system (single owner per clinic is the whole model for now).

---

## Next Steps

After Task 2 is approved and implemented:
- Task 3: `AvailabilityService` (uses `Schedule`/`Booking`/`BlockedTime` from Task 1, independent of auth)
- Task 4-6: Schedule/Booking/BlockedTime APIs — each controller will use
  `$request->user()->clinic` to scope queries to the right clinic's practitioners
