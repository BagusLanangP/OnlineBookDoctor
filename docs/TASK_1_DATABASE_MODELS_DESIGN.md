# Task 1: Database Models & Migrations - Detailed Design

**Deliverable:** 5 Eloquent models with full relationships + 5 migrations + demo seeder  
**Dependencies:** None (foundation task)  
**Estimated Time:** 2-3 hours

---

## File Structure

```
database/
├── migrations/
│   ├── 2026_10_30_000000_create_clinics_table.php
│   ├── 2026_10_30_000100_create_practitioners_table.php
│   ├── 2026_10_30_000200_create_schedules_table.php
│   ├── 2026_10_30_000300_create_bookings_table.php
│   └── 2026_10_30_000400_create_blocked_times_table.php
└── seeders/
    └── ClinicSeeder.php (creates clinic → practitioners → schedules → bookings → blocked_times)

app/
└── Models/
    ├── Clinic.php
    ├── Practitioner.php
    ├── Schedule.php
    ├── Booking.php
    └── BlockedTime.php
```

---

## Database Schema Details

### 1. `clinics` Table

**Purpose:** Store clinic owner accounts

**Columns:**
```
- id: bigIncrements
- name: string (e.g., "Clinic Maju Jaya")
- phone: string (e.g., "628123456789")
- whatsapp_number: string (e.g., "628123456789") 
- timezone: string (default: "Asia/Jakarta", e.g., "Asia/Surabaya")
- created_at: timestamp
- updated_at: timestamp
```

**Constraints:**
- Primary key: `id`
- Unique: `phone` (one clinic per phone)
- Unique: `whatsapp_number` (one clinic per WhatsApp)

**Indexes:**
- None (small table, PK sufficient)

**Notes:** 
- Phone and WhatsApp are separate for future flexibility
- Timezone needed for display (store times in UTC)

---

### 2. `practitioners` Table

**Purpose:** Store doctors/practitioners working at clinic

**Columns:**
```
- id: bigIncrements
- clinic_id: bigInteger (FK → clinics.id)
- name: string (e.g., "Dr. Ahmad Wijaya")
- specialty: string (e.g., "General Practice", nullable for MVP)
- created_at: timestamp
- updated_at: timestamp
```

**Constraints:*
- Primary key: `id`
- Foreign key: `clinic_id` → `clinics.id` (cascade delete)
- Unique: `(clinic_id, name)` (one practitioner name per clinic)

**Indexes:**
- `clinic_id` (frequently filtered by clinic)

**Notes:**
- Cascade delete: removing clinic removes all practitioners
- Specialty is nullable for Phase 2 MVP

---

### 3. `schedules` Table

**Purpose:** Store weekly working hours (Mon-Sun) for each practitioner

**Columns:**
```
- id: bigIncrements
- practitioner_id: bigInteger (FK → practitioners.id)
- day_of_week: tinyInteger (0=Sun, 1=Mon, ..., 6=Sat)
- start_time: time (e.g., "09:00:00")
- end_time: time (e.g., "17:00:00")
- created_at: timestamp
- updated_at: timestamp
```

**Constraints:**
- Primary key: `id`
- Foreign key: `practitioner_id` → `practitioners.id` (cascade delete)
- Unique: `(practitioner_id, day_of_week)` (only one schedule per day per practitioner)
- Validation: `start_time < end_time` (in model)

**Indexes:**
- `practitioner_id` (query schedules by practitioner)

**Example Data:**
```
Practitioner 1 (Dr. Ahmad):
- Mon (1): 09:00 - 17:00
- Tue (2): 09:00 - 17:00
- Wed (3): OFF (no record)
- Thu (4): 09:00 - 17:00
- Fri (5): 09:00 - 17:00
- Sat (6): 09:00 - 12:00
```

---

### 4. `bookings` Table

**Purpose:** Store patient appointments/bookings

**Columns:**
```
- id: bigIncrements
- practitioner_id: bigInteger (FK → practitioners.id)
- patient_name: string (e.g., "Budi Santoso")
- patient_phone: string (e.g., "628987654321")
- visit_reason: string (e.g., "Checkup", max 255)
- booked_time: timestamp (UTC, exact appointment time including minutes)
- status: enum('confirmed', 'completed', 'cancelled') [default: 'confirmed']
- created_at: timestamp
- updated_at: timestamp
```

**Constraints:**
- Primary key: `id`
- Foreign key: `practitioner_id` → `practitioners.id` (cascade delete)
- Unique: `(practitioner_id, booked_time)` (prevent double-booking)

**Indexes:**
- `practitioner_id` (list bookings for practitioner)
- `booked_time` (query appointments on date)
- `patient_phone` (find bookings by phone, for WhatsApp integration)
- `status` (filter by status)

**Notes:**
- `booked_time` is exact timestamp (stored UTC, but must match a 30-min slot)
- Example: `2026-10-30 10:00:00` = 10:00 AM on Oct 30
- Not `2026-10-30 10:15:00` (must be on slot boundary)

---

### 5. `blocked_times` Table

**Purpose:** Store vacation/unavailable periods

**Columns:**
```
- id: bigIncrements
- practitioner_id: bigInteger (FK → practitioners.id)
- start_time: timestamp (UTC)
- end_time: timestamp (UTC)
- reason: string (e.g., "Vacation", "Training", "Emergency", max 255)
- created_at: timestamp
- updated_at: timestamp
```

**Constraints:**
- Primary key: `id`
- Foreign key: `practitioner_id` → `practitioners.id` (cascade delete)
- Validation: `start_time < end_time` (in model)

**Indexes:**
- `practitioner_id` (list blocks for practitioner)
- `(practitioner_id, start_time)` (range queries for availability checking)

**Example Data:**
```
Practitioner 1:
- 2026-11-01 00:00:00 to 2026-11-07 23:59:59 (Vacation)
- 2026-12-25 00:00:00 to 2026-12-25 23:59:59 (Holiday)
```

---

## Eloquent Models

### Clinic Model (`app/Models/Clinic.php`)

```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Clinic extends Model
{
    protected $fillable = [
        'name',
        'phone',
        'whatsapp_number',
        'timezone',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function practitioners(): HasMany
    {
        return $this->hasMany(Practitioner::class);
    }
}
```

**Key Methods:**
- `practitioners()` → Get all practitioners for this clinic
- Chaining: `$clinic->practitioners()->with('schedules', 'bookings')`

---

### Practitioner Model (`app/Models/Practitioner.php`)

```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Practitioner extends Model
{
    protected $fillable = [
        'clinic_id',
        'name',
        'specialty',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function clinic(): BelongsTo
    {
        return $this->belongsTo(Clinic::class);
    }

    public function schedules(): HasMany
    {
        return $this->hasMany(Schedule::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function blockedTimes(): HasMany
    {
        return $this->hasMany(BlockedTime::class);
    }
}
```

**Key Methods:**
- `clinic()` → Get parent clinic
- `schedules()` → Get all weekly schedules
- `bookings()` → Get all bookings
- `blockedTimes()` → Get all vacation/blocked times

---

### Schedule Model (`app/Models/Schedule.php`)

```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Schedule extends Model
{
    protected $fillable = [
        'practitioner_id',
        'day_of_week',
        'start_time',
        'end_time',
    ];

    protected $casts = [
        'start_time' => 'time',
        'end_time' => 'time',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function practitioner(): BelongsTo
    {
        return $this->belongsTo(Practitioner::class);
    }

    // Helper to get day name
    public function getDayName(): string
    {
        return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 
                'Thursday', 'Friday', 'Saturday'][$this->day_of_week];
    }
}
```

**Key Notes:**
- `day_of_week` uses 0-6 (Sunday=0, Saturday=6)
- `start_time` and `end_time` are cast as `time` (stored as TIME, cast to string)

---

### Booking Model (`app/Models/Booking.php`)

```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Booking extends Model
{
    protected $fillable = [
        'practitioner_id',
        'patient_name',
        'patient_phone',
        'visit_reason',
        'booked_time',
        'status',
    ];

    protected $casts = [
        'booked_time' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function practitioner(): BelongsTo
    {
        return $this->belongsTo(Practitioner::class);
    }

    // Scope for active bookings (not cancelled)
    public function scopeActive($query)
    {
        return $query->where('status', '!=', 'cancelled');
    }

    // Scope for upcoming bookings
    public function scopeUpcoming($query)
    {
        return $query->where('booked_time', '>', now())
                     ->where('status', '!=', 'cancelled');
    }
}
```

**Key Notes:**
- `booked_time` is cast as datetime (stored as TIMESTAMP)
- Scopes for filtering active/upcoming bookings
- Status values: `'confirmed'`, `'completed'`, `'cancelled'`

---

### BlockedTime Model (`app/Models/BlockedTime.php`)

```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BlockedTime extends Model
{
    protected $table = 'blocked_times';

    protected $fillable = [
        'practitioner_id',
        'start_time',
        'end_time',
        'reason',
    ];

    protected $casts = [
        'start_time' => 'datetime',
        'end_time' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function practitioner(): BelongsTo
    {
        return $this->belongsTo(Practitioner::class);
    }
}
```

**Key Notes:**
- Table name explicit: `blocked_times` (not `blockeds`)
- `start_time` and `end_time` are full timestamps (for multi-day vacations)

---

## Migration Files

### Migration 1: `create_clinics_table`

```php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinics', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('phone')->unique();
            $table->string('whatsapp_number')->unique();
            $table->string('timezone')->default('Asia/Jakarta');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinics');
    }
};
```

---

### Migration 2: `create_practitioners_table`

```php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('practitioners', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinic_id')
                  ->constrained('clinics')
                  ->cascadeOnDelete();
            $table->string('name');
            $table->string('specialty')->nullable();
            $table->timestamps();

            // Unique constraint: one name per clinic
            $table->unique(['clinic_id', 'name']);
            
            // Index for frequent queries
            $table->index('clinic_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practitioners');
    }
};
```

---

### Migration 3: `create_schedules_table`

```php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('practitioner_id')
                  ->constrained('practitioners')
                  ->cascadeOnDelete();
            $table->tinyInteger('day_of_week'); // 0=Sun, 1=Mon, ..., 6=Sat
            $table->time('start_time');
            $table->time('end_time');
            $table->timestamps();

            // Unique: one schedule per (practitioner, day)
            $table->unique(['practitioner_id', 'day_of_week']);
            
            // Index for queries
            $table->index('practitioner_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('schedules');
    }
};
```

---

### Migration 4: `create_bookings_table`

```php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('practitioner_id')
                  ->constrained('practitioners')
                  ->cascadeOnDelete();
            $table->string('patient_name');
            $table->string('patient_phone');
            $table->string('visit_reason');
            $table->timestamp('booked_time');
            $table->enum('status', ['confirmed', 'completed', 'cancelled'])
                  ->default('confirmed');
            $table->timestamps();

            // Unique: prevent double-booking
            $table->unique(['practitioner_id', 'booked_time']);
            
            // Indexes for queries
            $table->index('practitioner_id');
            $table->index('booked_time');
            $table->index('patient_phone');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bookings');
    }
};
```

---

### Migration 5: `create_blocked_times_table`

```php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blocked_times', function (Blueprint $table) {
            $table->id();
            $table->foreignId('practitioner_id')
                  ->constrained('practitioners')
                  ->cascadeOnDelete();
            $table->timestamp('start_time');
            $table->timestamp('end_time');
            $table->string('reason');
            $table->timestamps();

            // Indexes for range queries
            $table->index('practitioner_id');
            $table->index(['practitioner_id', 'start_time']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blocked_times');
    }
};
```

---

## Demo Seeder

### `database/seeders/ClinicSeeder.php`

```php
namespace Database\Seeders;

use App\Models\Clinic;
use App\Models\Practitioner;
use App\Models\Schedule;
use App\Models\Booking;
use App\Models\BlockedTime;
use Illuminate\Database\Seeder;

class ClinicSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Create clinic
        $clinic = Clinic::create([
            'name' => 'Klinik Maju Jaya',
            'phone' => '628123456789',
            'whatsapp_number' => '628123456789',
            'timezone' => 'Asia/Jakarta',
        ]);

        // 2. Create practitioners
        $drAhmad = Practitioner::create([
            'clinic_id' => $clinic->id,
            'name' => 'Dr. Ahmad Wijaya',
            'specialty' => 'General Practice',
        ]);

        $drSiti = Practitioner::create([
            'clinic_id' => $clinic->id,
            'name' => 'Dr. Siti Nurhaliza',
            'specialty' => 'General Practice',
        ]);

        // 3. Create schedules for Dr. Ahmad (Mon-Sat, 09:00-17:00)
        for ($day = 1; $day <= 6; $day++) {
            Schedule::create([
                'practitioner_id' => $drAhmad->id,
                'day_of_week' => $day,
                'start_time' => '09:00:00',
                'end_time' => '17:00:00',
            ]);
        }

        // 4. Create schedules for Dr. Siti (Mon-Fri, 08:00-16:00)
        for ($day = 1; $day <= 5; $day++) {
            Schedule::create([
                'practitioner_id' => $drSiti->id,
                'day_of_week' => $day,
                'start_time' => '08:00:00',
                'end_time' => '16:00:00',
            ]);
        }

        // 5. Create sample bookings for next week
        $today = now()->startOfDay();
        
        // Booking 1: Tomorrow 10:00
        Booking::create([
            'practitioner_id' => $drAhmad->id,
            'patient_name' => 'Budi Santoso',
            'patient_phone' => '628987654321',
            'visit_reason' => 'Checkup',
            'booked_time' => $today->addDay()->setTime(10, 0),
            'status' => 'confirmed',
        ]);

        // Booking 2: Tomorrow 10:30
        Booking::create([
            'practitioner_id' => $drAhmad->id,
            'patient_name' => 'Siti Rahma',
            'patient_phone' => '628987654322',
            'visit_reason' => 'Follow-up',
            'booked_time' => $today->addDay()->setTime(10, 30),
            'status' => 'confirmed',
        ]);

        // Booking 3: In 3 days 14:00
        Booking::create([
            'practitioner_id' => $drSiti->id,
            'patient_name' => 'Rudi Hermawan',
            'patient_phone' => '628987654323',
            'visit_reason' => 'Consultation',
            'booked_time' => $today->addDays(3)->setTime(14, 0),
            'status' => 'confirmed',
        ]);

        // 6. Create blocked time for Dr. Ahmad (weekend vacation)
        BlockedTime::create([
            'practitioner_id' => $drAhmad->id,
            'start_time' => $today->copy()->addDays(7)->startOfDay(),
            'end_time' => $today->copy()->addDays(13)->endOfDay(),
            'reason' => 'Annual Leave',
        ]);
    }
}
```

---

## Testing Checklist

After implementing Task 1, verify in `php artisan tinker`:

```php
// Test Clinic → Practitioners
$clinic = Clinic::first();
$clinic->practitioners; // Should return 2

// Test Practitioner → Schedules
$dr = Practitioner::first();
$dr->schedules; // Should return 6 (Mon-Sat)
$dr->schedules->where('day_of_week', 1)->first()->start_time; // "09:00:00"

// Test Practitioner → Bookings
$bookings = $dr->bookings;
$bookings->count(); // Should be 2 (for Dr. Ahmad)
$bookings->first()->patient_name; // "Budi Santoso"

// Test Booking scope
Booking::active()->count(); // Should be 3 (not cancelled)
Booking::upcoming()->count(); // Should be 3 (in future)

// Test BlockedTime
$dr->blockedTimes; // Should return 1
$blocked = $dr->blockedTimes->first();
$blocked->reason; // "Annual Leave"

// Test unique constraint (should fail)
Schedule::create([
    'practitioner_id' => 1,
    'day_of_week' => 1,
    'start_time' => '10:00:00',
    'end_time' => '18:00:00',
]); // Should throw unique constraint error
```

---

## Success Criteria

✅ All 5 migrations run without error  
✅ Seeder creates 1 clinic, 2 practitioners, 6+5 schedules, 3 bookings, 1 blocked time  
✅ All relationships work in tinker  
✅ Unique constraints prevent duplicates  
✅ Cascade delete removes related records  
✅ Indexes created for performance  

---

## Next Steps

After Task 1 complete:
- Task 2: Add authentication & password to Clinic model
- Task 3: Implement AvailabilityService using this schema
- Task 4+: Build APIs using these models

---

**Notes for Implementation:**
- Use exact names, columns, and relationships from this design
- Run `php artisan migrate --seed` to test
- Don't skip indexes (needed for AvailabilityService queries)
- Test in tinker before moving to Task 2
