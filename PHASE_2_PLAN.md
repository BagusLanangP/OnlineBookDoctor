# Phase 2 Implementation Plan
**Clinic Booking System - Core Features**

## Overview

Phase 2 builds the core booking system on top of Phase 1's foundation (working Laravel + Inertia + React).

**Main Goals:**
- Database models for clinic, practitioners, schedules, bookings
- API endpoints for CRUD operations
- Availability calculation service
- Dashboard UI for clinic owners
- WhatsApp integration foundation

**Estimated Timeline:** 3-4 weeks

---

## Architecture & Tech Stack (Same as Phase 1)

- **Backend:** Laravel 13 + Eloquent ORM
- **Frontend:** Inertia + React (TypeScript)
- **Database:** SQLite (dev) / MySQL (prod)
- **External:** Twilio WhatsApp API (Phase 3)

---

## Phase 2 Tasks Breakdown

### Task 1: Database Models & Migrations

**Deliverable:** Complete Eloquent models with relationships

**Files to create:**
- `app/Models/Clinic.php` — clinic owner accounts
- `app/Models/Practitioner.php` — doctors/practitioners
- `app/Models/Schedule.php` — weekly working hours
- `app/Models/Booking.php` — patient bookings
- `app/Models/BlockedTime.php` — vacation/unavailable slots

**Migrations** (if not already done):
- `create_clinics_table`
- `create_practitioners_table`
- `create_schedules_table`
- `create_bookings_table`
- `create_blocked_times_table`

**Steps:**
1. Create migrations with proper indexes and constraints
2. Create Eloquent models with relationships
3. Test relationships in tinker

---

### Task 2: Authentication & Clinic Middleware

**Deliverable:** Clinic owner login + protected routes

**Files:**
- `app/Http/Middleware/EnsureClinicIsAuthenticated.php`
- Clinic model updates (add password_hash, authentication methods)
- `database/seeders/ClinicSeeder.php` — demo data

**Steps:**
1. Add password_hash column to clinics table
2. Create middleware to check clinic authentication
3. Create seeder with demo clinic + practitioners
4. Test login flow manually

---

### Task 3: Availability Service

**Deliverable:** Calculate available time slots for booking

**Files:**
- `app/Services/AvailabilityService.php`
- `tests/Unit/AvailabilityServiceTest.php`

**Logic:**
- Get practitioner's schedule for a given day
- Remove already-booked slots
- Remove blocked times
- Return available slots (30-min intervals)

**Tests to cover:**
- Available slots for a day with full schedule
- Slots with existing bookings removed
- Slots with blocked times removed
- Day with no schedule returns empty

---

### Task 4: Schedule API

**Deliverable:** CRUD endpoints for managing schedules

**Routes:**
- `POST /api/schedules` — create weekly schedule
- `GET /api/schedules/{practitioner_id}` — list schedules
- `PUT /api/schedules/{schedule}` — update
- `DELETE /api/schedules/{schedule}` — delete

**Controller:** `ScheduleController.php`

**Tests:**
- Create schedule
- List by practitioner
- Update schedule
- Delete schedule
- Validate day_of_week (0-6)
- Validate start_time < end_time

---

### Task 5: Booking API

**Deliverable:** CRUD + validation for patient bookings

**Routes:**
- `POST /api/bookings` — create booking (internal + WhatsApp)
- `GET /api/bookings` — list clinic's bookings
- `PUT /api/bookings/{booking}` — update status
- `DELETE /api/bookings/{booking}` — cancel

**Controller:** `BookingController.php`

**Logic:**
- Validate slot is available (use AvailabilityService)
- Prevent double-booking (unique constraint)
- Capture: patient_name, patient_phone, visit_reason, booked_time

**Tests:**
- Create valid booking
- Prevent double-booking same time
- List bookings for clinic
- Update booking status (confirmed → completed/cancelled)

---

### Task 6: Blocked Times API

**Deliverable:** Vacation/unavailable time management

**Routes:**
- `POST /api/blocked-times` — block time period
- `GET /api/blocked-times/{practitioner_id}` — list blocks
- `DELETE /api/blocked-times/{block}` — remove block

**Use cases:**
- Vacation
- Training/meetings
- Emergency closures

---

### Task 7: Dashboard Overview Page

**Deliverable:** React page showing clinic status

**File:** `resources/js/Pages/Dashboard.tsx`

**Displays:**
- Today's bookings
- Upcoming week's schedule
- Practitioners list
- Quick stats (total bookings, etc.)

**Data fetching:** From `/api/bookings` endpoint

---

### Task 8: Schedule Management UI

**Deliverable:** Page to set weekly hours per practitioner

**File:** `resources/js/Pages/Schedules/Edit.tsx`

**Features:**
- Select practitioner
- Set working hours for each day (Mon-Sun)
- Visual weekly grid
- Save to `/api/schedules`

---

### Task 9: Bookings List UI

**Deliverable:** View/manage all bookings

**File:** `resources/js/Pages/Bookings/Index.tsx`

**Features:**
- Table of bookings
- Filter by date/practitioner
- Mark as completed/cancelled
- View patient contact info

---

### Task 10: Blocked Times UI

**Deliverable:** Manage vacation/unavailable times

**File:** `resources/js/Pages/BlockedTimes/Create.tsx`

**Features:**
- Date range picker
- Reason text
- Add/remove blocks

---

### Task 11: Settings Page

**Deliverable:** Clinic configuration

**File:** `resources/js/Pages/Settings/Index.tsx`

**Settings:**
- Clinic name
- Phone number
- Timezone
- Notification preferences (for Phase 3)

---

### Task 12: Layout & Navigation

**Deliverable:** Main app layout with sidebar navigation

**Files:**
- `resources/js/Layouts/AppLayout.tsx` — main layout
- Navigation between pages
- Logout button

---

### Task 13: Testing & Polish

**Deliverable:** All features tested end-to-end

**Tests:**
- Unit tests for services
- Feature tests for APIs
- Manual UI testing
- Edge cases (timezone handling, concurrent bookings, etc.)

---

## Dependencies Between Tasks

```
Task 1 (Models) 
  ↓
Task 2 (Auth) + Task 3 (AvailabilityService)
  ↓
Task 4 (Schedule API) + Task 5 (Booking API) + Task 6 (BlockedTimes API)
  ↓
Task 7-12 (UI Pages) — can work in parallel
  ↓
Task 13 (Testing & Polish)
```

---

## Success Criteria

✅ Clinic owner can log in  
✅ Clinic owner can set practitioner schedules  
✅ Clinic owner can view all bookings  
✅ Clinic owner can block unavailable times  
✅ Booking API prevents double-booking  
✅ Available slots calculated correctly (accounting for bookings + blocks)  
✅ Dashboard shows real-time data  
✅ All pages have basic error handling  
✅ Mobile-responsive UI  

---

## What's NOT in Phase 2 (Phase 3)

- WhatsApp bot logic
- Automated notifications
- Payment processing
- Advanced reporting

---

## Recommended Approach

**Start with:**
1. Tasks 1-2 (Models + Auth) — foundation
2. Task 3 (AvailabilityService) — test-driven
3. Tasks 4-6 (APIs) — build all endpoints
4. Tasks 7-12 (UI) — build pages in parallel
5. Task 13 (Testing) — verify everything works

**Time allocation:**
- Tasks 1-6 (Backend): 2 weeks
- Tasks 7-12 (Frontend): 1.5 weeks
- Task 13 (Testing): 0.5 weeks

---

## Questions to Answer Before Starting

1. **Booking slot duration:** Should we support 30-min, 60-min, or configurable slots?
2. **Timezone handling:** Store all times in UTC? Display in clinic's timezone?
3. **Notification emails:** Should clinic owner get email on new booking? (Phase 3 scope)
4. **Cancellation window:** Can patients cancel within 24 hours, or need clinic approval?

---

## Next Steps

1. **Approve this plan** — any changes needed?
2. **Choose execution approach:**
   - Native (I build everything in this session)
   - Subagent-driven (fresh agent per task with review)
3. **Start Phase 2 tasks** in order

Ready to begin Phase 2? 🚀
