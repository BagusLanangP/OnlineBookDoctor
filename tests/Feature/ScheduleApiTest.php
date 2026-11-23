<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Clinic;
use App\Models\Practitioner;
use App\Models\Schedule;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Task 12: GET/PUT /api/practitioners/{p}/schedules untuk Next.js.
 * Logika sinkronisasi juga dijaga ScheduleWeekTest (rute Inertia lama);
 * di sini fokus pada jalur /api, bentuk JSON, dan pasien terdampak (`outside`).
 *
 * "Sekarang" dibekukan di Selasa 2030-01-01 00:00 UTC. Senin berikutnya
 * 2030-01-07; 02:00Z = 09:00 WIB (Asia/Jakarta, UTC+7).
 */
class ScheduleApiTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Clinic $clinic;

    private Practitioner $practitioner;

    private Practitioner $otherPractitioner;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2030-01-01 00:00:00');

        [$this->owner, $this->clinic, $this->practitioner] = $this->makeClinic('A');
        [, , $this->otherPractitioner] = $this->makeClinic('B');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** @return array{0: User, 1: Clinic, 2: Practitioner} */
    private function makeClinic(string $suffix): array
    {
        $user = User::factory()->create();
        $clinic = Clinic::create([
            'user_id' => $user->id,
            'name' => "Clinic $suffix",
            'phone' => "0811-$suffix",
            'whatsapp_number' => "62811-$suffix",
            'timezone' => 'Asia/Jakarta',
        ]);
        $practitioner = Practitioner::create(['clinic_id' => $clinic->id, 'name' => "Dr. $suffix"]);

        return [$user, $clinic, $practitioner];
    }

    private function url(Practitioner $p): string
    {
        return "/api/practitioners/{$p->id}/schedules";
    }

    private function day(int $dow, string $start = '09:00', string $end = '17:00'): array
    {
        return ['day_of_week' => $dow, 'start_time' => $start, 'end_time' => $end];
    }

    private function makeSchedule(Practitioner $p, int $dow, string $start = '09:00:00', string $end = '17:00:00'): void
    {
        Schedule::create(['practitioner_id' => $p->id, 'day_of_week' => $dow, 'start_time' => $start, 'end_time' => $end]);
    }

    private function book(string $utc, string $status = 'confirmed', ?Practitioner $p = null): Booking
    {
        static $n = 0;
        $n++;

        return Booking::create([
            'practitioner_id' => ($p ?? $this->practitioner)->id,
            'patient_name' => "Pasien $n",
            'patient_phone' => '628987654321',
            'visit_reason' => 'Kontrol',
            'booked_time' => $utc,
            'status' => $status,
        ]);
    }

    // --- akses -------------------------------------------------------------

    public function test_requires_login(): void
    {
        $this->getJson($this->url($this->practitioner))->assertUnauthorized();
        $this->putJson($this->url($this->practitioner), ['schedules' => []])->assertUnauthorized();
    }

    public function test_account_without_clinic_gets_403(): void
    {
        $this->actingAs(User::factory()->create());

        $this->getJson($this->url($this->practitioner))->assertForbidden();
    }

    public function test_other_clinic_practitioner_is_forbidden(): void
    {
        $this->makeSchedule($this->otherPractitioner, 1);
        $this->actingAs($this->owner);

        $this->getJson($this->url($this->otherPractitioner))->assertForbidden();
        $this->putJson($this->url($this->otherPractitioner), ['schedules' => []])->assertForbidden();
        $this->assertDatabaseCount('schedules', 1);
    }

    // --- GET ---------------------------------------------------------------

    public function test_show_returns_hh_mm_sorted_by_day(): void
    {
        $this->makeSchedule($this->practitioner, 5, '13:00:00', '20:30:00');
        $this->makeSchedule($this->practitioner, 1);
        $this->actingAs($this->owner);

        $this->getJson($this->url($this->practitioner))
            ->assertOk()
            ->assertExactJson([
                'practitioner_id' => $this->practitioner->id,
                'schedules' => [$this->day(1), $this->day(5, '13:00', '20:30')],
            ]);
    }

    public function test_show_without_schedule_returns_empty_list(): void
    {
        $this->actingAs($this->owner);

        $this->getJson($this->url($this->practitioner))->assertOk()->assertJson(['schedules' => []]);
    }

    // --- PUT ---------------------------------------------------------------

    public function test_update_syncs_week_and_returns_new_schedule(): void
    {
        $this->makeSchedule($this->practitioner, 1);
        $this->makeSchedule($this->practitioner, 2);
        $this->actingAs($this->owner);

        $this->putJson($this->url($this->practitioner), [
            'schedules' => [$this->day(1, '10:00', '12:00'), $this->day(6, '08:00', '11:00')],
        ])
            ->assertOk()
            ->assertJson([
                'practitioner_id' => $this->practitioner->id,
                'schedules' => [$this->day(1, '10:00', '12:00'), $this->day(6, '08:00', '11:00')],
                'outside_bookings' => 0,
                'outside' => [],
            ]);

        $this->assertDatabaseMissing('schedules', ['practitioner_id' => $this->practitioner->id, 'day_of_week' => 2]);
        $this->assertDatabaseHas('schedules', ['practitioner_id' => $this->practitioner->id, 'day_of_week' => 6, 'start_time' => '08:00:00']);
    }

    public function test_empty_list_switches_every_day_off(): void
    {
        $this->makeSchedule($this->practitioner, 1);
        $this->actingAs($this->owner);

        $this->putJson($this->url($this->practitioner), ['schedules' => []])
            ->assertOk()
            ->assertJson(['schedules' => []]);

        $this->assertDatabaseCount('schedules', 0);
    }

    public function test_invalid_payload_is_rejected_and_nothing_saved(): void
    {
        $this->makeSchedule($this->practitioner, 1);
        $this->actingAs($this->owner);

        $this->putJson($this->url($this->practitioner), ['schedules' => [$this->day(1), $this->day(2, '12:00', '12:00')]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['schedules.1.end_time']);

        $this->putJson($this->url($this->practitioner), ['schedules' => [$this->day(1), $this->day(1)]])
            ->assertUnprocessable();

        $this->putJson($this->url($this->practitioner), ['schedules' => [$this->day(7)]])
            ->assertUnprocessable();

        $this->assertDatabaseHas('schedules', ['day_of_week' => 1, 'start_time' => '09:00:00', 'end_time' => '17:00:00']);
        $this->assertDatabaseCount('schedules', 1);
    }

    // --- pasien terdampak ----------------------------------------------------

    public function test_booking_on_switched_off_day_is_reported_and_kept_confirmed(): void
    {
        $this->makeSchedule($this->practitioner, 1);
        $booking = $this->book('2030-01-07 02:00:00'); // Senin 09:00 WIB
        $this->actingAs($this->owner);

        $this->putJson($this->url($this->practitioner), ['schedules' => [$this->day(2)]])
            ->assertOk()
            ->assertJson([
                'outside_bookings' => 1,
                'outside' => [[
                    'id' => $booking->id,
                    'patient_name' => $booking->patient_name,
                    'patient_phone' => '628987654321',
                    'booked_time' => '2030-01-07T02:00:00Z',
                ]],
            ]);

        $this->assertSame('confirmed', $booking->fresh()->status);
    }

    public function test_bookings_before_start_or_past_end_are_reported_inside_are_not(): void
    {
        $before = $this->book('2030-01-07 02:00:00'); // 09:00 WIB, jam baru mulai 10:00
        $inside = $this->book('2030-01-07 04:00:00'); // 11:00 WIB
        $lastFit = $this->book('2030-01-07 07:30:00'); // 14:30 WIB, selesai 15:00 = muat
        $overrun = $this->book('2030-01-07 07:45:00'); // 14:45 WIB, slot lewat 15:00
        $this->actingAs($this->owner);

        $response = $this->putJson($this->url($this->practitioner), ['schedules' => [$this->day(1, '10:00', '15:00')]])
            ->assertOk()
            ->assertJson(['outside_bookings' => 2]);

        $this->assertEqualsCanonicalizing([$before->id, $overrun->id], $response->json('outside.*.id'));
        $this->assertNotContains($inside->id, $response->json('outside.*.id'));
        $this->assertNotContains($lastFit->id, $response->json('outside.*.id'));
    }

    public function test_past_completed_cancelled_and_other_doctor_bookings_are_ignored(): void
    {
        $this->book('2029-12-31 02:00:00'); // lampau (Senin)
        $this->book('2030-01-07 02:00:00', 'completed');
        $this->book('2030-01-07 03:00:00', 'cancelled');
        $other = Practitioner::create(['clinic_id' => $this->clinic->id, 'name' => 'Dr. Lain']);
        $this->book('2030-01-07 02:00:00', 'confirmed', $other);
        $this->actingAs($this->owner);

        $this->putJson($this->url($this->practitioner), ['schedules' => []])
            ->assertOk()
            ->assertJson(['outside_bookings' => 0, 'outside' => []]);
    }

    public function test_outside_is_computed_in_clinic_timezone(): void
    {
        // 01:30Z Senin = 08:30 WIB (di luar 09:00-17:00) tetapi 09:30 WITA (di dalam).
        $this->clinic->update(['timezone' => 'Asia/Makassar']);
        $this->book('2030-01-07 01:30:00');
        $this->actingAs($this->owner);

        $this->putJson($this->url($this->practitioner), ['schedules' => [$this->day(1)]])
            ->assertOk()
            ->assertJson(['outside_bookings' => 0]);

        $this->clinic->update(['timezone' => 'Asia/Jakarta']);

        $this->putJson($this->url($this->practitioner), ['schedules' => [$this->day(1)]])
            ->assertOk()
            ->assertJson(['outside_bookings' => 1]);
    }

    public function test_outside_list_is_capped_but_count_is_complete(): void
    {
        for ($i = 0; $i < 52; $i++) {
            $this->book(Carbon::parse('2030-01-07 02:00:00')->addWeeks($i)->toDateTimeString());
        }
        $this->actingAs($this->owner);

        $response = $this->putJson($this->url($this->practitioner), ['schedules' => []])
            ->assertOk()
            ->assertJson(['outside_bookings' => 52]);

        $this->assertCount(50, $response->json('outside'));
        $this->assertSame('2030-01-07T02:00:00Z', $response->json('outside.0.booked_time'));
    }
}
