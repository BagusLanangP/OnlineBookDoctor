# Phase 2: Core Booking System Implementation Plan

**Project:** Online Clinic Booking System  
**Phase:** 2 (Core Features)  
**Created:** 2026-10-30  
**Duration:** 3-4 weeks  

---

## Executive Summary

Phase 2 transforms the authenticated Laravel + Inertia + React foundation (Phase 1) into a functional clinic booking system. This phase covers:

- **Database layer:** Clinic, practitioners, schedules, bookings, blocked times
- **API layer:** RESTful endpoints for all CRUD operations
- **Business logic:** Availability calculation, booking validation
- **UI layer:** Dashboard, schedule management, bookings list
- **Foundation for Phase 3:** WhatsApp bot integration

---

## Phase 2 Goals

| Goal | Success Metric |
|------|---|
| Clinic owners can manage practitioner schedules | UI form for setting weekly hours |
| System prevents double-booking | Unique database constraint + API validation |
| Availability calculation is accurate | Unit tests cover 5+ scenarios |
| Dashboard shows real-time data | API responses < 200ms |
| Mobile-friendly UI | Works on phone/tablet |

---

## System Architecture

### Database Schema

```
clinics
├── id, name, phone, whatsapp_number, timezone, created_at
└── Relations: hasMany practitioners

practitioners
├── id, clinic_id, name, specialty, created_at
└── Relations: hasMany schedules, hasMany bookings, hasMany blockedTimes

schedules
├── id, practitioner_id, day_of_week, start_time, end_time
├── Unique constraint: (practitioner_id, day_of_week)
└── Relations: belongsTo practitioner

bookings
├── id, practitioner_id, patient_name, patient_phone, visit_reason, booked_time, status
├── Unique constraint: (practitioner_id, booked_time)
├── Indexes: practitioner_id, booked_time, patient_phone
└── Relations: belongsTo practitioner

blocked_times
├── id, practitioner_id, start_time, end_time, reason
├── Indexes: practitioner_id, start_time
└── Relations: belongsTo practitioner
```

### API Endpoints

**Schedules:**
```
POST   /api/schedules              - Create schedule
GET    /api/schedules/{id}         - List for practitioner
PUT    /api/schedules/{schedule}   - Update
DELETE /api/schedules/{schedule}   - Delete
```

**Bookings:**
```
POST   /api/bookings               - Create booking
GET    /api/bookings               - List clinic's bookings
PUT    /api/bookings/{booking}     - Update status
DELETE /api/bookings/{booking}     - Cancel
```

**Blocked Times:**
```
POST   /api/blocked-times          - Block time
GET    /api/blocked-times/{id}     - List blocks
DELETE /api/blocked-times/{block}  - Remove block
```

**Availability (Helper):**
```
GET    /api/availability/{practitioner_id}?date=2026-10-30
       → Returns: ["09:00", "09:30", "10:00", ...]
```

---

## Detailed Task Breakdown

### Backend Tasks (Weeks 1-2)

#### Task 1: Database Models & Migrations

**What:** Create Eloquent models with relationships and migrations

**Files:**
- `app/Models/Clinic.php`
- `app/Models/Practitioner.php`
- `app/Models/Schedule.php`
- `app/Models/Booking.php`
- `app/Models/BlockedTime.php`
- `database/migrations/YYYY_MM_DD_create_clinic_tables.php` (multiple)

**Steps:**
```
1. Create migrations with proper schema
   - Foreign keys with cascade delete
   - Indexes on frequently-queried columns
   - Unique constraints to prevent duplicates

2. Create Eloquent models
   - Define fillable properties
   - Add relationships (hasMany, belongsTo)
   - Add custom casts (datetime fields)

3. Create database seeder with demo data
   - 1 clinic
   - 2 practitioners
   - Sample schedules
   - Sample bookings

4. Test in tinker
   php artisan tinker
   > Clinic::first()->practitioners
   > Practitioner::find(1)->schedules()
```

**Success Criteria:**
- All migrations run without error
- All relationships work in tinker
- Seeder creates realistic demo data

---

#### Task 2: Authentication & Clinic Guard

**What:** Set up clinic owner authentication

**Files:**
- Update `app/Models/Clinic.php` with password_hash
- `app/Http/Controllers/AuthController.php` (if not done)
- `app/Http/Middleware/EnsureClinicIsAuthenticated.php` (if not done)
- `database/seeders/ClinicSeeder.php`
- `database/migrations/YYYY_MM_DD_add_password_to_clinics.php`

**Steps:**
```
1. Add password_hash column to clinics table
2. Create/update clinic seeder
   - Hash password with Hash::make('demo_password')
3. Test login flow
   POST /auth/login
   {
     "whatsapp_number": "whatsapp:+628123456789",
     "password": "demo_password"
   }
```

**Success Criteria:**
- Clinic can log in with demo credentials
- Session created
- Middleware protects routes

---

#### Task 3: Availability Service

**What:** Calculate available time slots, accounting for bookings and blocks

**Files:**
- `app/Services/AvailabilityService.php`
- `tests/Unit/AvailabilityServiceTest.php`

**Logic:**
```typescript
// Input
{
  practitioner_id: 1,
  date: "2026-10-30",  // Tuesday
  slot_duration_minutes: 30
}

// Process
1. Get practitioner's schedule for Tuesday
2. Get booked times for that day
3. Get blocked times for that day
4. Generate slots: 09:00, 09:30, 10:00, ..., 17:00
5. Remove booked & blocked slots
6. Return available slots

// Output
["09:00", "10:00", "10:30", "14:00", "14:30", "15:00"]
```

**Tests to cover:**
```
1. Full day available → returns all slots
2. With existing bookings → removes them
3. With blocked times → removes them
4. No schedule for day → returns empty
5. Day with mixed availability → correct calculation
```

**Success Criteria:**
- All unit tests pass
- Service handles edge cases
- Timezone-aware if needed

---

#### Task 4: Schedule API

**What:** CRUD endpoints for weekly practitioner schedules

**Files:**
- `app/Http/Controllers/ScheduleController.php`
- `tests/Feature/ScheduleTest.php`
- Update `routes/api.php`

**Endpoints:**
```
POST /api/schedules
{
  "practitioner_id": 1,
  "day_of_week": 1,          // 0=Sunday, 1=Monday, ..., 6=Saturday
  "start_time": "09:00:00",
  "end_time": "17:00:00"
}

GET /api/schedules/1
→ Returns all schedules for practitioner 1

PUT /api/schedules/1
{
  "start_time": "08:30:00",
  "end_time": "17:30:00"
}

DELETE /api/schedules/1
```

**Validation:**
- Practitioner must belong to clinic
- day_of_week: 0-6
- start_time < end_time
- Unique: one schedule per (practitioner, day_of_week)

**Tests:**
```
1. Create schedule → stored in DB
2. Update → changes reflected
3. Delete → removed from DB
4. Invalid day_of_week → 422 error
5. start_time >= end_time → 422 error
6. Duplicate schedule → 422 error
```

**Success Criteria:**
- All CRUD operations work
- Validation prevents invalid data
- Tests pass

---

#### Task 5: Booking API

**What:** Create, list, update bookings with availability validation

**Files:**
- `app/Http/Controllers/BookingController.php`
- `tests/Feature/BookingTest.php`
- Update `routes/api.php`

**Endpoints:**
```
POST /api/bookings
{
  "practitioner_id": 1,
  "patient_name": "John Doe",
  "patient_phone": "628123456789",
  "visit_reason": "Checkup",
  "booked_time": "2026-10-30 10:00:00"  // UTC
}
→ Returns booking with 201 status

GET /api/bookings
→ Returns all bookings for clinic (sorted by date)

PUT /api/bookings/1
{
  "status": "completed"  // or "cancelled"
}

DELETE /api/bookings/1
```

**Validation:**
```
1. Check availability using AvailabilityService
2. Prevent double-booking (unique constraint)
3. Require: patient_name, patient_phone, visit_reason
4. booked_time must be in future
5. booked_time must match schedule
```

**Tests:**
```
1. Create valid booking → stored
2. Double-booking same slot → error
3. Booking outside schedule hours → error
4. List bookings → ordered by date
5. Update status → persisted
6. Cancel booking → marked cancelled
```

**Success Criteria:**
- All CRUD operations work
- Double-booking prevented
- All tests pass

---

#### Task 6: Blocked Times API

**What:** Manage vacation/unavailable time periods

**Files:**
- `app/Http/Controllers/BlockedTimeController.php`
- `tests/Feature/BlockedTimeTest.php`
- Update `routes/api.php`

**Endpoints:**
```
POST /api/blocked-times
{
  "practitioner_id": 1,
  "start_time": "2026-11-10 00:00:00",
  "end_time": "2026-11-17 23:59:59",
  "reason": "Vacation"
}

GET /api/blocked-times/1
→ Returns all blocks for practitioner

DELETE /api/blocked-times/1
```

**Tests:**
```
1. Create block → stored
2. List blocks → for practitioner
3. Delete block → removed
4. AvailabilityService respects blocks
```

**Success Criteria:**
- Blocks prevent bookings
- CRUD operations work
- Tests pass

---

### Frontend Tasks (Weeks 1.5-2.5, parallel with backend)

#### Task 7: Dashboard Page

**File:** `resources/js/Pages/Dashboard.tsx`

**Shows:**
```
┌─────────────────────────────────┐
│ Dashboard                       │
├─────────────────────────────────┤
│                                 │
│ Today's Bookings (3)            │
│ ├─ 10:00 John Doe - Checkup     │
│ ├─ 11:00 Jane Smith - Follow-up │
│ └─ 14:00 Bob Brown - Consultation│
│                                 │
│ This Week's Schedule            │
│ ├─ Mon: Dr. Ahmad (9-5)         │
│ ├─ Tue: Dr. Siti (9-5)          │
│ └─ ...                          │
│                                 │
│ Practitioners (2)               │
│ ├─ Dr. Ahmad                    │
│ └─ Dr. Siti                     │
│                                 │
└─────────────────────────────────┘
```

**Data source:** `/api/bookings`, `/api/schedules`

**Success Criteria:**
- Shows real-time data
- Responsive on mobile
- No errors in console

---

#### Task 8: Schedule Management Page

**File:** `resources/js/Pages/Schedules/Edit.tsx`

**Features:**
```
1. Select Practitioner dropdown
2. For each day (Mon-Sun):
   - Toggle "Working" checkbox
   - If working: start_time & end_time inputs
   - Save to /api/schedules

3. Visual weekly grid showing current schedule
4. Validation: start < end
5. Submit button saves to API
```

**Success Criteria:**
- Can set/update schedules
- Visual feedback on save
- Mobile-friendly form

---

#### Task 9: Bookings List Page

**File:** `resources/js/Pages/Bookings/Index.tsx`

**Features:**
```
Table:
- Patient Name
- Phone
- Practitioner
- Date/Time
- Reason
- Status (confirmed/completed/cancelled)
- Actions: Mark done, Cancel

Filters:
- Date range
- Practitioner
- Status

Sorting:
- By date (newest first)
```

**Success Criteria:**
- Lists all bookings
- Can update status
- Filters work
- Responsive

---

#### Task 10: Blocked Times Page

**File:** `resources/js/Pages/BlockedTimes/Create.tsx`

**Features:**
```
Form:
- Practitioner select
- Date range picker (start/end)
- Reason (text input)
- Submit button

List:
- Show existing blocks
- Delete button for each
```

**Success Criteria:**
- Can create blocks
- Can delete blocks
- Prevents future bookings in blocked period

---

#### Task 11: Settings Page

**File:** `resources/js/Pages/Settings/Index.tsx`

**Settings:**
```
- Clinic Name
- Phone Number
- WhatsApp Number
- Timezone (dropdown)
- Notification preferences (for Phase 3)
```

**Success Criteria:**
- Can update settings
- Settings persist

---

#### Task 12: App Layout & Navigation

**File:** `resources/js/Layouts/AppLayout.tsx`

**Structure:**
```
┌────────────────────────────────┐
│ Clinic Name      [Logout]      │
├────────┬─────────────────────┤
│ Nav    │                     │
│ ├ Home │                     │
│ ├ Sch. │    Page Content     │
│ ├ Book │                     │
│ ├ Set. │                     │
│ └ Bloc │                     │
│        │                     │
└────────┴─────────────────────┘
```

**Success Criteria:**
- Navigation works
- Links functional
- Logout works

---

### Testing Task (Week 3)

#### Task 13: Testing & Polish

**What:** Comprehensive testing and edge case handling

**Tests to add:**
```
1. Unit Tests (app/Services)
   - AvailabilityService (10+ tests)
   - Any helpers/utilities

2. Feature Tests (routes/API)
   - ScheduleTest (10+ tests)
   - BookingTest (10+ tests)
   - BlockedTimeTest (5+ tests)

3. Manual Testing (UI)
   - Create schedule → book appointment → see on dashboard
   - Block time → check availability
   - Cancel booking → status updates
   - Logout → redirected to login
```

**Edge cases:**
```
1. Timezone handling
2. Concurrent bookings
3. Past date bookings (should fail)
4. Overlapping blocked times
5. Practitioner with no schedule
6. Same-day booking
```

**Polish:**
```
1. Error messages clear
2. Loading states on buttons
3. Confirmation before delete
4. Mobile responsive
5. Form validation clear
```

**Success Criteria:**
- All tests pass
- 90%+ code coverage
- No console errors
- Mobile-friendly

---

## Implementation Order

**Week 1:**
```
Day 1-2: Task 1 (Models) + Task 2 (Auth)
Day 3-4: Task 3 (AvailabilityService) + Task 4 (Schedule API)
Day 5: Task 5 (Booking API) + Task 6 (BlockedTime API)
```

**Week 2:**
```
Day 1-2: Task 7 (Dashboard) + Task 8 (Schedule UI)
Day 3-4: Task 9 (Bookings UI) + Task 10 (BlockedTimes UI)
Day 5: Task 11 (Settings) + Task 12 (Layout)
```

**Week 3:**
```
Task 13: Testing, edge cases, polish
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| 30-min slots (fixed) | Simpler than configurable; can enhance later |
| UTC storage, local display | Standard practice; handles timezones correctly |
| Unique constraint on (practitioner_id, booked_time) | Prevents double-booking at DB level |
| Separate BlockedTime table | Flexible for vacations, meetings, emergencies |
| AvailabilityService class | Centralized, testable, reusable logic |

---

## Success Metrics

After Phase 2 completion:

✅ Clinic owner can log in  
✅ Set weekly schedules per practitioner  
✅ See bookings in dashboard  
✅ Block unavailable times  
✅ Prevent double-booking  
✅ Calculate availability correctly  
✅ UI is mobile-responsive  
✅ All tests pass (80%+ coverage)  
✅ API responds < 200ms  

---

## Phase 3 Dependencies

Phase 2 builds the foundation for Phase 3 (WhatsApp Integration):
- Bookings API ready for WhatsApp bot to create bookings
- AvailabilityService ready to calculate slots for WhatsApp responses
- Notification system prepared for upcoming reminders

---

## Questions to Resolve Before Starting

1. **Slot duration:** Fixed 30-min or configurable per practitioner?
   - Recommendation: Fixed 30-min for MVP

2. **Timezone handling:** How to display times?
   - Recommendation: Store UTC, display in clinic's timezone (from settings)

3. **Cancellation policy:** Who can cancel? How long before appointment?
   - Recommendation: Anyone can cancel anytime (Phase 3 can add restrictions)

4. **Notification emails:** Send to clinic owner on new booking?
   - Recommendation: Skip for Phase 2, Phase 3 adds WhatsApp + email

5. **Concurrent requests:** How to handle race conditions?
   - Recommendation: Database unique constraints + API validation

---

## Execution Approach

**Recommended:** Native (I build everything in this session)
- Faster delivery
- Maintains context
- Easier debugging

**Alternative:** Subagent-driven (fresh agent per task)
- More independent review
- Parallel work possible
- Higher cost

---

## Timeline Summary

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1 | 1 day | ✅ COMPLETE |
| Phase 2 | 3-4 weeks | 📋 PLANNED |
| Phase 3 | 2-3 weeks | 🔜 TODO |

**Total MVP delivery:** ~2 months

---

## Next Steps

1. **Review this plan** — any changes?
2. **Confirm key decisions** — answer the 5 questions above
3. **Choose execution approach** — native or subagent-driven?
4. **Kick off Phase 2** — let's build! 🚀

---

**Created:** 2026-10-30  
**Status:** Ready for approval
