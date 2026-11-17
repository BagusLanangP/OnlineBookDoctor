<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Clinic;
use App\Models\Practitioner;
use App\Models\Schedule;
use App\Models\User;
use App\Services\AvailabilityService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class ScheduleWeekTest extends TestCase
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

        // Wednesday 2025-01-15 12:00 WIB, so Monday 2025-01-20 is in the future.
        Carbon::setTestNow(Carbon::parse('2025-01-15 12:00', 'Asia/Jakarta')->utc());

        [$this->owner, $this->practitioner] = $this->makeClinicWithPractitioner('A', 'Dr. Budi');
        [$this->otherOwner, $this->otherPractitioner] = $this->makeClinicWithPractitioner('B', 'Dr. Other');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /**
     * @return array{0: User, 1: Practitioner}
     */
    private function makeClinicWithPractitioner(string $suffix, string $name): array
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
            'name' => $name,
            'specialty' => 'General',
        ]);

        return [$user, $practitioner];
    }

    private function makeSchedule(Practitioner $p, int $dow, string $start = '09:00:00', string $end = '17:00:00'): Schedule
    {
        return Schedule::create([
            'practitioner_id' => $p->id,
            'day_of_week' => $dow,
            'start_time' => $start,
            'end_time' => $end,
        ]);
    }

    private function day(int $dow, string $start = '09:00', string $end = '17:00'): array
    {
        return ['day_of_week' => $dow, 'start_time' => $start, 'end_time' => $end];
    }

    /** Raw TIME column values, e.g. "09:00:00", keyed by day_of_week. */
    private function stored(Practitioner $p): array
    {
        return Schedule::where('practitioner_id', $p->id)
            ->orderBy('day_of_week')
            ->get()
            ->mapWithKeys(fn ($s) => [
                $s->day_of_week => [$s->getRawOriginal('start_time'), $s->getRawOriginal('end_time')],
            ])
            ->all();
    }

    private function saveWeek(Practitioner $p, array $payload, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->owner)
            ->from('/schedules/edit')
            ->put("/practitioners/{$p->id}/schedules", $payload);
    }

    // ---- edit (page props) -------------------------------------------------

    public function test_edit_defaults_to_first_practitioner_by_name(): void
    {
        $zed = Practitioner::create([
            'clinic_id' => $this->practitioner->clinic_id,
            'name' => 'Dr. Zed',
            'specialty' => null,
        ]);
        $this->makeSchedule($zed, 2);
        $this->makeSchedule($this->practitioner, 1, '09:00:00', '15:30:00');

        $this->actingAs($this->owner)->get('/schedules/edit')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Schedules/Edit')
                ->has('practitioners', 2)
                ->where('practitioners.0.name', 'Dr. Budi')
                ->where('practitioner.id', $this->practitioner->id)
                ->has('schedules', 1)
                ->where('schedules.0.day_of_week', 1)
                ->where('schedules.0.start_time', '09:00')
                ->where('schedules.0.end_time', '15:30'));
    }

    public function test_edit_with_own_practitioner_shows_only_their_schedules(): void
    {
        $zed = Practitioner::create([
            'clinic_id' => $this->practitioner->clinic_id,
            'name' => 'Dr. Zed',
            'specialty' => null,
        ]);
        $this->makeSchedule($this->practitioner, 1);
        $this->makeSchedule($zed, 3, '10:00:00', '14:00:00');

        $this->actingAs($this->owner)->get("/schedules/edit?practitioner={$zed->id}")
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('practitioner.id', $zed->id)
                ->has('schedules', 1)
                ->where('schedules.0.day_of_week', 3)
                ->where('schedules.0.start_time', '10:00'));
    }

    public function test_edit_with_other_clinics_practitioner_is_forbidden(): void
    {
        $this->actingAs($this->owner)
            ->get("/schedules/edit?practitioner={$this->otherPractitioner->id}")
            ->assertForbidden();
    }

    public function test_edit_for_clinic_without_practitioners_renders_empty_state(): void
    {
        $user = User::factory()->create();
        Clinic::create(['user_id' => $user->id, 'name' => 'Empty', 'phone' => '0', 'whatsapp_number' => '0']);

        $this->actingAs($user)->get('/schedules/edit')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->has('practitioners', 0)
                ->where('practitioner', null)
                ->has('schedules', 0));
    }

    // ---- update (bulk save) ------------------------------------------------

    public function test_update_creates_days_and_stores_hms(): void
    {
        $this->saveWeek($this->practitioner, ['schedules' => [
            $this->day(1), $this->day(3, '10:00', '14:00'), $this->day(5, '08:30:00', '12:00:00'),
        ]])->assertRedirect('/schedules/edit')->assertSessionHasNoErrors();

        $this->assertSame([
            1 => ['09:00:00', '17:00:00'],
            3 => ['10:00:00', '14:00:00'],
            5 => ['08:30:00', '12:00:00'],
        ], $this->stored($this->practitioner));
    }

    public function test_update_changes_drops_and_adds_days(): void
    {
        $monday = $this->makeSchedule($this->practitioner, 1);
        $this->makeSchedule($this->practitioner, 2);

        $this->saveWeek($this->practitioner, ['schedules' => [
            $this->day(1, '10:00', '15:00'), $this->day(5),
        ]])->assertSessionHasNoErrors();

        $this->assertSame([
            1 => ['10:00:00', '15:00:00'],
            5 => ['09:00:00', '17:00:00'],
        ], $this->stored($this->practitioner));
        // Monday was updated in place, not deleted and recreated.
        $this->assertSame($monday->id, Schedule::where('practitioner_id', $this->practitioner->id)->where('day_of_week', 1)->value('id'));
    }

    public function test_update_with_empty_list_switches_every_day_off(): void
    {
        $this->makeSchedule($this->practitioner, 1);
        $this->makeSchedule($this->practitioner, 4);

        $this->saveWeek($this->practitioner, ['schedules' => []])->assertSessionHasNoErrors();

        $this->assertSame([], $this->stored($this->practitioner));
    }

    public function test_update_only_touches_that_practitioner(): void
    {
        $sibling = Practitioner::create([
            'clinic_id' => $this->practitioner->clinic_id,
            'name' => 'Dr. Sibling',
            'specialty' => null,
        ]);
        $this->makeSchedule($sibling, 2, '08:00:00', '12:00:00');
        $this->makeSchedule($this->otherPractitioner, 1);

        $this->saveWeek($this->practitioner, ['schedules' => []])->assertSessionHasNoErrors();

        $this->assertSame([2 => ['08:00:00', '12:00:00']], $this->stored($sibling));
        $this->assertSame([1 => ['09:00:00', '17:00:00']], $this->stored($this->otherPractitioner));
    }

    public function test_switching_a_day_off_keeps_existing_bookings_confirmed(): void
    {
        $this->makeSchedule($this->practitioner, 1);
        $booking = Booking::create([
            'practitioner_id' => $this->practitioner->id,
            'patient_name' => 'Patient',
            'patient_phone' => '0812',
            'visit_reason' => 'Checkup',
            'booked_time' => Carbon::parse('2025-01-20 10:00', 'Asia/Jakarta')->utc(),
            'status' => 'confirmed',
        ]);

        $this->saveWeek($this->practitioner, ['schedules' => []])->assertSessionHasNoErrors();

        $this->assertSame('confirmed', $booking->fresh()->status);
    }

    // ---- validation --------------------------------------------------------

    public function test_end_before_start_on_second_row_errors_on_that_row_and_saves_nothing(): void
    {
        $this->makeSchedule($this->practitioner, 1, '09:00:00', '17:00:00');

        $this->saveWeek($this->practitioner, ['schedules' => [
            $this->day(2, '09:00', '12:00'),
            $this->day(3, '15:00', '10:00'),
        ]])->assertSessionHasErrors('schedules.1.end_time')
            ->assertSessionDoesntHaveErrors('schedules.0.end_time');

        // Validation runs before the transaction: the old week is untouched.
        $this->assertSame([1 => ['09:00:00', '17:00:00']], $this->stored($this->practitioner));
    }

    public function test_equal_start_and_end_is_rejected(): void
    {
        $this->saveWeek($this->practitioner, ['schedules' => [$this->day(1, '09:00', '09:00')]])
            ->assertSessionHasErrors('schedules.0.end_time');
    }

    /**
     * @see invalidPayloads
     */
    #[DataProvider('invalidPayloads')]
    public function test_invalid_payloads_are_rejected_and_nothing_is_saved(array $payload, string $errorKey): void
    {
        $this->makeSchedule($this->practitioner, 1);

        $this->saveWeek($this->practitioner, $payload)->assertSessionHasErrors($errorKey);

        $this->assertSame([1 => ['09:00:00', '17:00:00']], $this->stored($this->practitioner));
    }

    public static function invalidPayloads(): array
    {
        $day = fn (int $dow) => ['day_of_week' => $dow, 'start_time' => '09:00', 'end_time' => '17:00'];

        return [
            'duplicate day' => [['schedules' => [$day(1), $day(1)]], 'schedules.0.day_of_week'],
            'day 7' => [['schedules' => [$day(7)]], 'schedules.0.day_of_week'],
            'negative day' => [['schedules' => [$day(-1)]], 'schedules.0.day_of_week'],
            'garbage start' => [['schedules' => [['day_of_week' => 1, 'start_time' => 'abc', 'end_time' => '17:00']]], 'schedules.0.start_time'],
            'missing end' => [['schedules' => [['day_of_week' => 1, 'start_time' => '09:00']]], 'schedules.0.end_time'],
            'eight rows' => [['schedules' => array_map($day, [0, 1, 2, 3, 4, 5, 6, 6])], 'schedules'],
            'schedules key missing' => [[], 'schedules'],
        ];
    }

    public function test_update_for_other_clinics_practitioner_is_forbidden(): void
    {
        $this->makeSchedule($this->otherPractitioner, 1);

        $this->saveWeek($this->otherPractitioner, ['schedules' => []])->assertForbidden();

        $this->assertSame([1 => ['09:00:00', '17:00:00']], $this->stored($this->otherPractitioner));
    }

    // ---- access ------------------------------------------------------------

    public function test_guest_is_redirected_to_login_on_both_routes(): void
    {
        $this->get('/schedules/edit')->assertRedirect('/login');
        $this->put("/practitioners/{$this->practitioner->id}/schedules", ['schedules' => []])
            ->assertRedirect('/login');
    }

    public function test_user_without_clinic_is_forbidden(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/schedules/edit')->assertForbidden();
        $this->actingAs($user)
            ->put("/practitioners/{$this->practitioner->id}/schedules", ['schedules' => []])
            ->assertForbidden();
    }

    // ---- integration -------------------------------------------------------

    public function test_saved_hours_drive_availability(): void
    {
        $this->makeSchedule($this->practitioner, 1, '09:00:00', '17:00:00'); // Monday
        $this->makeSchedule($this->practitioner, 2, '09:00:00', '17:00:00'); // Tuesday

        // Keep Monday but shorten it; drop Tuesday.
        $this->saveWeek($this->practitioner, ['schedules' => [$this->day(1, '10:00', '12:00')]])
            ->assertSessionHasNoErrors();

        $service = app(AvailabilityService::class);
        $practitioner = $this->practitioner->fresh();

        $monday = collect($service->getAvailableSlots($practitioner, '2025-01-20'))->pluck('time')->all();
        $tuesday = $service->getAvailableSlots($practitioner, '2025-01-21');

        $this->assertSame(['10:00', '10:30', '11:00', '11:30'], $monday);
        $this->assertSame([], $tuesday);
    }
}
