<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Clinic;
use App\Models\Practitioner;
use App\Models\Schedule;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Practitioner $practitioner;

    private User $otherOwner;

    private Practitioner $otherPractitioner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();

        // Rabu 2025-01-15 12:00 WIB (05:00 UTC) — jauh dari tengah malam.
        Carbon::setTestNow(Carbon::parse('2025-01-15 12:00', 'Asia/Jakarta')->utc());

        [$this->owner, $this->practitioner] = $this->makeClinicWithPractitioner('A');
        [$this->otherOwner, $this->otherPractitioner] = $this->makeClinicWithPractitioner('B');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /**
     * @return array{0: User, 1: Practitioner}
     */
    private function makeClinicWithPractitioner(string $suffix): array
    {
        $user = User::factory()->create();

        $clinic = Clinic::create([
            'user_id' => $user->id,
            'name' => "Clinic $suffix",
            'phone' => "0811-$suffix",
            'whatsapp_number' => "62811-$suffix",
        ]);

        $practitioner = Practitioner::create([
            'clinic_id' => $clinic->id,
            'name' => "Dr. $suffix",
            'specialty' => 'General',
        ]);

        return [$user, $practitioner];
    }

    private function makeBooking(Practitioner $p, string $localTime, string $status = 'confirmed'): Booking
    {
        return Booking::create([
            'practitioner_id' => $p->id,
            'patient_name' => 'Patient',
            'patient_phone' => '0812',
            'visit_reason' => 'Checkup',
            'booked_time' => Carbon::parse($localTime, 'Asia/Jakarta')->utc(),
            'status' => $status,
        ]);
    }

    public function test_todays_booking_shows_with_local_time(): void
    {
        $this->makeBooking($this->practitioner, '2025-01-15 10:00');

        $this->actingAs($this->owner)->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Dashboard')
                ->has('todayBookings', 1)
                ->where('todayBookings.0.time', '10:00'));
    }

    public function test_timezone_boundary_uses_clinic_day(): void
    {
        $this->makeBooking($this->practitioner, '2025-01-15 00:30'); // included
        $this->makeBooking($this->practitioner, '2025-01-16 00:30'); // tomorrow, excluded
        $this->makeBooking($this->practitioner, '2025-01-14 23:30'); // yesterday, excluded

        $this->actingAs($this->owner)->get('/dashboard')
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->has('todayBookings', 1)
                ->where('todayBookings.0.time', '00:30'));
    }

    public function test_cancelled_excluded_and_completed_included(): void
    {
        $this->makeBooking($this->practitioner, '2025-01-15 09:00', 'cancelled');
        $this->makeBooking($this->practitioner, '2025-01-15 10:00', 'completed');

        $this->actingAs($this->owner)->get('/dashboard')
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->has('todayBookings', 1)
                ->where('todayBookings.0.status', 'completed'));
    }

    public function test_other_clinic_data_never_appears(): void
    {
        $this->makeBooking($this->otherPractitioner, '2025-01-15 10:00');
        Schedule::create([
            'practitioner_id' => $this->otherPractitioner->id,
            'day_of_week' => 1,
            'start_time' => '09:00:00',
            'end_time' => '17:00:00',
        ]);

        $this->actingAs($this->owner)->get('/dashboard')
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->has('todayBookings', 0)
                ->has('weekSchedules', 0)
                ->has('practitioners', 1)
                ->where('practitioners.0.name', 'Dr. A'));
    }

    public function test_week_schedules_have_hhmm_times(): void
    {
        Schedule::create([
            'practitioner_id' => $this->practitioner->id,
            'day_of_week' => 1,
            'start_time' => '09:00:00',
            'end_time' => '17:00:00',
        ]);

        $this->actingAs($this->owner)->get('/dashboard')
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->has('weekSchedules', 1)
                ->where('weekSchedules.0.start_time', '09:00')
                ->where('weekSchedules.0.end_time', '17:00')
                ->where('weekSchedules.0.day_of_week', 1));
    }

    public function test_today_dow_follows_clinic_timezone(): void
    {
        // Minggu 20:00 UTC = Senin 03:00 WIB.
        Carbon::setTestNow(Carbon::parse('2025-01-19 20:00', 'UTC'));

        $this->actingAs($this->owner)->get('/dashboard')
            ->assertInertia(fn (AssertableInertia $page) => $page->where('todayDow', 1));
    }

    public function test_clinic_with_no_data_returns_empty_arrays(): void
    {
        $user = User::factory()->create();
        Clinic::create([
            'user_id' => $user->id,
            'name' => 'Empty',
            'phone' => '0',
            'whatsapp_number' => '0',
        ]);

        $this->actingAs($user)->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->has('todayBookings', 0)
                ->has('weekSchedules', 0)
                ->has('practitioners', 0));
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get('/dashboard')->assertRedirect('/login');
    }

    public function test_user_without_clinic_gets_403(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/dashboard')->assertForbidden();
    }
}
