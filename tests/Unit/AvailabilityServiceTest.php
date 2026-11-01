<?php

namespace Tests\Unit;

use App\Models\BlockedTime;
use App\Models\Booking;
use App\Models\Clinic;
use App\Models\Practitioner;
use App\Models\Schedule;
use App\Models\User;
use App\Services\AvailabilityService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AvailabilityServiceTest extends TestCase
{
    use RefreshDatabase;

    private AvailabilityService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new AvailabilityService;
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function practitioner(string $timezone = 'UTC'): Practitioner
    {
        $clinic = Clinic::create([
            'user_id' => User::factory()->create()->id,
            'name' => 'Test Clinic',
            'phone' => '62800'.random_int(1000000, 9999999),
            'whatsapp_number' => '62800'.random_int(1000000, 9999999),
            'timezone' => $timezone,
        ]);

        return Practitioner::create([
            'clinic_id' => $clinic->id,
            'name' => 'Dr. Test',
        ]);
    }

    private function scheduleFor(Practitioner $practitioner, string $date, string $start, string $end): Schedule
    {
        $dayOfWeek = Carbon::parse($date, $practitioner->clinic->timezone)->dayOfWeek;

        return Schedule::create([
            'practitioner_id' => $practitioner->id,
            'day_of_week' => $dayOfWeek,
            'start_time' => $start,
            'end_time' => $end,
        ]);
    }

    public function test_full_day_available_returns_all_slots(): void
    {
        Carbon::setTestNow('2026-11-01 00:00:00');
        $practitioner = $this->practitioner();
        $date = '2026-11-02';
        $this->scheduleFor($practitioner, $date, '09:00:00', '17:00:00');

        $slots = $this->service->getAvailableSlots($practitioner, $date);

        $this->assertCount(16, $slots);
        $this->assertSame('09:00', $slots[0]['time']);
        $this->assertSame('16:30', $slots[15]['time']);
    }

    public function test_existing_booking_removes_slot(): void
    {
        Carbon::setTestNow('2026-11-01 00:00:00');
        $practitioner = $this->practitioner();
        $date = '2026-11-02';
        $this->scheduleFor($practitioner, $date, '09:00:00', '17:00:00');

        Booking::create([
            'practitioner_id' => $practitioner->id,
            'patient_name' => 'Budi',
            'patient_phone' => '628111111111',
            'visit_reason' => 'Checkup',
            'booked_time' => Carbon::parse($date.' 10:00:00', 'UTC'),
            'status' => 'confirmed',
        ]);

        $slots = $this->service->getAvailableSlots($practitioner, $date);

        $this->assertCount(15, $slots);
        $this->assertNotContains('10:00', array_column($slots, 'time'));
    }

    public function test_cancelled_booking_does_not_remove_slot(): void
    {
        Carbon::setTestNow('2026-11-01 00:00:00');
        $practitioner = $this->practitioner();
        $date = '2026-11-02';
        $this->scheduleFor($practitioner, $date, '09:00:00', '17:00:00');

        Booking::create([
            'practitioner_id' => $practitioner->id,
            'patient_name' => 'Budi',
            'patient_phone' => '628111111111',
            'visit_reason' => 'Checkup',
            'booked_time' => Carbon::parse($date.' 10:00:00', 'UTC'),
            'status' => 'cancelled',
        ]);

        $slots = $this->service->getAvailableSlots($practitioner, $date);

        $this->assertCount(16, $slots);
        $this->assertContains('10:00', array_column($slots, 'time'));
    }

    public function test_blocked_time_removes_grid_aligned_slots(): void
    {
        Carbon::setTestNow('2026-11-01 00:00:00');
        $practitioner = $this->practitioner();
        $date = '2026-11-02';
        $this->scheduleFor($practitioner, $date, '09:00:00', '17:00:00');

        BlockedTime::create([
            'practitioner_id' => $practitioner->id,
            'start_time' => Carbon::parse($date.' 14:00:00', 'UTC'),
            'end_time' => Carbon::parse($date.' 15:00:00', 'UTC'),
            'reason' => 'Meeting',
        ]);

        $slots = $this->service->getAvailableSlots($practitioner, $date);

        $this->assertCount(14, $slots);
        $this->assertNotContains('14:00', array_column($slots, 'time'));
        $this->assertNotContains('14:30', array_column($slots, 'time'));
    }

    public function test_blocked_time_removes_slots_even_when_not_grid_aligned(): void
    {
        Carbon::setTestNow('2026-11-01 00:00:00');
        $practitioner = $this->practitioner();
        $date = '2026-11-02';
        $this->scheduleFor($practitioner, $date, '09:00:00', '17:00:00');

        // 30-minute block that straddles the 14:00 and 14:30 slot boundaries.
        BlockedTime::create([
            'practitioner_id' => $practitioner->id,
            'start_time' => Carbon::parse($date.' 14:15:00', 'UTC'),
            'end_time' => Carbon::parse($date.' 14:45:00', 'UTC'),
            'reason' => 'Short meeting',
        ]);

        $slots = $this->service->getAvailableSlots($practitioner, $date);

        $this->assertNotContains('14:00', array_column($slots, 'time'));
        $this->assertNotContains('14:30', array_column($slots, 'time'));
    }

    public function test_no_schedule_for_day_returns_empty_array(): void
    {
        Carbon::setTestNow('2026-11-01 00:00:00');
        $practitioner = $this->practitioner();

        $slots = $this->service->getAvailableSlots($practitioner, '2026-11-02');

        $this->assertSame([], $slots);
    }

    public function test_mixed_bookings_and_blocks_together(): void
    {
        Carbon::setTestNow('2026-11-01 00:00:00');
        $practitioner = $this->practitioner();
        $date = '2026-11-02';
        $this->scheduleFor($practitioner, $date, '09:00:00', '17:00:00');

        Booking::create([
            'practitioner_id' => $practitioner->id,
            'patient_name' => 'Budi',
            'patient_phone' => '628111111111',
            'visit_reason' => 'Checkup',
            'booked_time' => Carbon::parse($date.' 09:00:00', 'UTC'),
            'status' => 'confirmed',
        ]);

        BlockedTime::create([
            'practitioner_id' => $practitioner->id,
            'start_time' => Carbon::parse($date.' 13:00:00', 'UTC'),
            'end_time' => Carbon::parse($date.' 14:00:00', 'UTC'),
            'reason' => 'Lunch meeting',
        ]);

        $slots = $this->service->getAvailableSlots($practitioner, $date);
        $times = array_column($slots, 'time');

        $this->assertCount(13, $slots);
        $this->assertNotContains('09:00', $times);
        $this->assertNotContains('13:00', $times);
        $this->assertNotContains('13:30', $times);
        $this->assertContains('09:30', $times);
    }

    public function test_past_slots_excluded_for_today(): void
    {
        // Clinic in UTC so "local" time equals the frozen "now" directly.
        $practitioner = $this->practitioner('UTC');
        $date = '2026-11-02';
        $this->scheduleFor($practitioner, $date, '09:00:00', '17:00:00');

        Carbon::setTestNow($date.' 14:35:00');

        $slots = $this->service->getAvailableSlots($practitioner, $date);
        $times = array_column($slots, 'time');

        $this->assertNotContains('09:00', $times);
        $this->assertNotContains('14:00', $times);
        $this->assertContains('15:00', $times);
    }

    public function test_non_grid_aligned_schedule_window_has_no_trailing_partial_slot(): void
    {
        Carbon::setTestNow('2026-11-01 00:00:00');
        $practitioner = $this->practitioner();
        $date = '2026-11-02';
        $this->scheduleFor($practitioner, $date, '09:00:00', '17:05:00');

        $slots = $this->service->getAvailableSlots($practitioner, $date);

        $this->assertCount(16, $slots);
        $this->assertSame('16:30', $slots[15]['time']);
    }

    public function test_timezone_conversion_is_correct(): void
    {
        Carbon::setTestNow('2026-11-01 00:00:00');
        $practitioner = $this->practitioner('Asia/Jakarta'); // UTC+7
        $date = '2026-11-02';
        $this->scheduleFor($practitioner, $date, '09:00:00', '17:00:00');

        $slots = $this->service->getAvailableSlots($practitioner, $date);

        $this->assertSame('09:00', $slots[0]['time']);
        $this->assertSame('2026-11-02 02:00:00', $slots[0]['datetime_utc']->toDateTimeString());
    }

    public function test_returned_datetime_utc_can_create_a_booking(): void
    {
        Carbon::setTestNow('2026-11-01 00:00:00');
        $practitioner = $this->practitioner('Asia/Jakarta');
        $date = '2026-11-02';
        $this->scheduleFor($practitioner, $date, '09:00:00', '17:00:00');

        $slots = $this->service->getAvailableSlots($practitioner, $date);
        $chosen = $slots[0];

        $booking = Booking::create([
            'practitioner_id' => $practitioner->id,
            'patient_name' => 'Budi',
            'patient_phone' => '628111111111',
            'visit_reason' => 'Checkup',
            'booked_time' => $chosen['datetime_utc'],
            'status' => 'confirmed',
        ]);

        $this->assertNotNull($booking->id);
        $this->assertSame(
            $chosen['datetime_utc']->toDateTimeString(),
            $booking->booked_time->toDateTimeString()
        );
    }
}
