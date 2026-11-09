<?php

namespace Tests\Feature;

use App\Models\BlockedTime;
use App\Models\Booking;
use App\Models\Clinic;
use App\Models\Practitioner;
use App\Models\Schedule;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BlockedTimeTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Practitioner $practitioner;

    private User $otherOwner;

    private Practitioner $otherPractitioner;

    protected function setUp(): void
    {
        parent::setUp();

        [$this->owner, $this->practitioner] = $this->makeClinicWithPractitioner('A');
        [$this->otherOwner, $this->otherPractitioner] = $this->makeClinicWithPractitioner('B');

        $this->makeSchedule($this->practitioner);
        $this->makeSchedule($this->otherPractitioner);
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

    private function makeSchedule(Practitioner $practitioner, int $day = 1): Schedule
    {
        return Schedule::create([
            'practitioner_id' => $practitioner->id,
            'day_of_week' => $day,
            'start_time' => '09:00:00',
            'end_time' => '17:00:00',
        ]);
    }

    /** Waktu klinik (Asia/Jakarta) di Senin depan, dikirim sebagai UTC. */
    private function mondayUtc(string $localTime = '10:00'): string
    {
        return Carbon::parse(now('Asia/Jakarta')->next('Monday')->toDateString().' '.$localTime, 'Asia/Jakarta')
            ->utc()
            ->toIso8601String();
    }

    private function url(?Practitioner $practitioner = null): string
    {
        return '/practitioners/'.($practitioner ?? $this->practitioner)->id.'/blocked-times';
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'start_time' => $this->mondayUtc('10:00'),
            'end_time' => $this->mondayUtc('12:00'),
            'reason' => 'Rapat',
        ], $overrides);
    }

    private function makeBlock(Practitioner $practitioner, string $start, string $end, string $reason = 'Libur'): BlockedTime
    {
        return BlockedTime::create([
            'practitioner_id' => $practitioner->id,
            'start_time' => Carbon::parse($start),
            'end_time' => Carbon::parse($end),
            'reason' => $reason,
        ]);
    }

    private function makeBooking(Practitioner $practitioner, string $localTime = '10:00', string $status = 'confirmed'): Booking
    {
        return Booking::create([
            'practitioner_id' => $practitioner->id,
            'patient_name' => 'Pasien',
            'patient_phone' => '628111111111',
            'visit_reason' => 'Checkup',
            'booked_time' => Carbon::parse($this->mondayUtc($localTime)),
            'status' => $status,
        ]);
    }

    private function bookingPayload(string $localTime): array
    {
        return [
            'practitioner_id' => $this->practitioner->id,
            'patient_name' => 'Budi',
            'patient_phone' => '628123456789',
            'visit_reason' => 'Checkup',
            'booked_time' => $this->mondayUtc($localTime),
        ];
    }

    // 1
    public function test_can_create_block_stored_in_utc(): void
    {
        $this->actingAs($this->owner)
            ->postJson($this->url(), $this->payload())
            ->assertCreated()
            ->assertJsonPath('conflicting_bookings', 0)
            ->assertJsonPath('reason', 'Rapat');

        $block = BlockedTime::firstOrFail();
        $this->assertSame($this->practitioner->id, $block->practitioner_id);
        $this->assertTrue($block->start_time->equalTo(Carbon::parse($this->mondayUtc('10:00'))));
        $this->assertTrue($block->end_time->equalTo(Carbon::parse($this->mondayUtc('12:00'))));
    }

    // 2
    public function test_end_time_must_be_after_start_time(): void
    {
        $this->actingAs($this->owner)
            ->postJson($this->url(), $this->payload(['end_time' => $this->mondayUtc('09:00')]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('end_time');

        $this->actingAs($this->owner)
            ->postJson($this->url(), $this->payload(['end_time' => $this->mondayUtc('10:00')]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('end_time');

        $this->assertDatabaseCount('blocked_times', 0);
    }

    // 3
    public function test_validation_errors_for_missing_and_invalid_fields(): void
    {
        $this->actingAs($this->owner)
            ->postJson($this->url(), [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['start_time', 'end_time', 'reason']);

        $this->actingAs($this->owner)
            ->postJson($this->url(), $this->payload(['start_time' => 'garbage']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('start_time');

        $this->assertDatabaseCount('blocked_times', 0);
    }

    // 4
    public function test_block_over_existing_booking_warns_without_cancelling(): void
    {
        $inside = $this->makeBooking($this->practitioner, '10:30');
        $this->makeBooking($this->practitioner, '11:00', 'cancelled');
        $this->makeBooking($this->practitioner, '14:00'); // di luar blok

        $this->actingAs($this->owner)
            ->postJson($this->url(), $this->payload())
            ->assertCreated()
            ->assertJsonPath('conflicting_bookings', 1);

        $this->assertSame('confirmed', $inside->fresh()->status);
    }

    // 5
    public function test_index_lists_only_that_practitioners_blocks_soonest_first(): void
    {
        $this->makeBlock($this->practitioner, $this->mondayUtc('13:00'), $this->mondayUtc('14:00'), 'Kedua');
        $this->makeBlock($this->practitioner, $this->mondayUtc('09:00'), $this->mondayUtc('10:00'), 'Pertama');
        $this->makeBlock($this->otherPractitioner, $this->mondayUtc('09:00'), $this->mondayUtc('10:00'), 'Klinik B');

        $response = $this->actingAs($this->owner)->getJson($this->url())->assertOk();

        $this->assertSame(['Pertama', 'Kedua'], collect($response->json('data'))->pluck('reason')->all());
    }

    // 6
    public function test_index_upcoming_excludes_past_blocks(): void
    {
        $this->makeBlock($this->practitioner, now()->subDays(3)->toIso8601String(), now()->subDays(2)->toIso8601String(), 'Lalu');
        $this->makeBlock($this->practitioner, now()->addDay()->toIso8601String(), now()->addDays(2)->toIso8601String(), 'Depan');

        $all = $this->actingAs($this->owner)->getJson($this->url())->assertOk();
        $this->assertCount(2, $all->json('data'));

        $upcoming = $this->actingAs($this->owner)->getJson($this->url().'?upcoming=1')->assertOk();
        $this->assertSame(['Depan'], collect($upcoming->json('data'))->pluck('reason')->all());
    }

    // 7
    public function test_can_delete_block(): void
    {
        $block = $this->makeBlock($this->practitioner, $this->mondayUtc('10:00'), $this->mondayUtc('12:00'));

        $this->actingAs($this->owner)
            ->deleteJson("/blocked-times/{$block->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('blocked_times', ['id' => $block->id]);
    }

    // 8
    public function test_block_prevents_booking_until_deleted(): void
    {
        $created = $this->actingAs($this->owner)
            ->postJson($this->url(), $this->payload(['start_time' => $this->mondayUtc('10:00'), 'end_time' => $this->mondayUtc('12:00')]))
            ->assertCreated();

        $this->actingAs($this->owner)
            ->postJson('/bookings', $this->bookingPayload('11:00'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('booked_time');

        $this->actingAs($this->owner)->deleteJson('/blocked-times/'.$created->json('id'))->assertNoContent();

        $this->actingAs($this->owner)
            ->postJson('/bookings', $this->bookingPayload('11:00'))
            ->assertCreated();
    }

    // 9
    public function test_non_grid_aligned_block_removes_every_overlapping_slot(): void
    {
        $this->actingAs($this->owner)
            ->postJson($this->url(), $this->payload([
                'start_time' => $this->mondayUtc('09:45'),
                'end_time' => $this->mondayUtc('10:15'),
            ]))
            ->assertCreated();

        foreach (['09:30', '10:00'] as $blocked) {
            $this->actingAs($this->owner)
                ->postJson('/bookings', $this->bookingPayload($blocked))
                ->assertUnprocessable();
        }

        foreach (['09:00', '10:30'] as $free) {
            $this->actingAs($this->owner)
                ->postJson('/bookings', $this->bookingPayload($free))
                ->assertCreated();
        }
    }

    // 10
    public function test_cannot_access_other_clinics_practitioner_or_block(): void
    {
        $this->actingAs($this->owner)
            ->getJson($this->url($this->otherPractitioner))
            ->assertForbidden();

        $this->actingAs($this->owner)
            ->postJson($this->url($this->otherPractitioner), $this->payload())
            ->assertForbidden();

        $this->assertDatabaseCount('blocked_times', 0);

        $block = $this->makeBlock($this->otherPractitioner, $this->mondayUtc('10:00'), $this->mondayUtc('12:00'));

        $this->actingAs($this->owner)
            ->deleteJson("/blocked-times/{$block->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('blocked_times', ['id' => $block->id]);
    }

    // 11
    public function test_guests_are_redirected_to_login(): void
    {
        $block = $this->makeBlock($this->practitioner, $this->mondayUtc('10:00'), $this->mondayUtc('12:00'));

        $this->get($this->url())->assertRedirect('/login');
        $this->post($this->url(), $this->payload())->assertRedirect('/login');
        $this->delete("/blocked-times/{$block->id}")->assertRedirect('/login');
    }
}
