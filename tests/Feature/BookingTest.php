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

class BookingTest extends TestCase
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

        // Senin (day_of_week 1), 09:00-17:00 waktu klinik, untuk kedua klinik.
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

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'practitioner_id' => $this->practitioner->id,
            'patient_name' => 'Budi',
            'patient_phone' => '628123456789',
            'visit_reason' => 'Checkup',
            'booked_time' => $this->mondayUtc(),
        ], $overrides);
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

    public function test_can_create_booking_in_open_slot(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/bookings', $this->payload())
            ->assertCreated();

        $this->assertDatabaseHas('bookings', [
            'practitioner_id' => $this->practitioner->id,
            'patient_name' => 'Budi',
            'status' => 'confirmed',
        ]);
    }

    public function test_cannot_double_book_same_slot(): void
    {
        $this->actingAs($this->owner)->postJson('/bookings', $this->payload())->assertCreated();

        $this->actingAs($this->owner)
            ->postJson('/bookings', $this->payload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('booked_time');
    }

    public function test_cannot_book_outside_schedule_hours(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/bookings', $this->payload(['booked_time' => $this->mondayUtc('20:00')]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('booked_time');
    }

    public function test_cannot_book_on_day_without_schedule(): void
    {
        $tuesday = Carbon::parse(now('Asia/Jakarta')->next('Tuesday')->toDateString().' 10:00', 'Asia/Jakarta')
            ->utc()->toIso8601String();

        $this->actingAs($this->owner)
            ->postJson('/bookings', $this->payload(['booked_time' => $tuesday]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('booked_time');
    }

    public function test_cannot_book_in_the_past(): void
    {
        $past = Carbon::parse(now('Asia/Jakarta')->previous('Monday')->toDateString().' 10:00', 'Asia/Jakarta')
            ->utc()->toIso8601String();

        $this->actingAs($this->owner)
            ->postJson('/bookings', $this->payload(['booked_time' => $past]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('booked_time');
    }

    public function test_validation_errors_for_invalid_fields(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/bookings', $this->payload([
                'patient_name' => '',
                'patient_phone' => 'abc',
                'visit_reason' => '',
            ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['patient_name', 'patient_phone', 'visit_reason']);
    }

    public function test_cancelled_slot_can_be_booked_again(): void
    {
        $first = $this->actingAs($this->owner)->postJson('/bookings', $this->payload())->assertCreated();

        $this->actingAs($this->owner)->deleteJson('/bookings/'.$first->json('id'))->assertNoContent();

        $this->actingAs($this->owner)
            ->postJson('/bookings', $this->payload(['patient_name' => 'Siti']))
            ->assertCreated();

        $this->assertDatabaseHas('bookings', ['patient_name' => 'Siti', 'status' => 'confirmed']);
    }

    public function test_index_lists_only_own_clinic_bookings_ordered_by_time(): void
    {
        $this->makeBooking($this->practitioner, '11:00');
        $this->makeBooking($this->practitioner, '09:00');
        $this->makeBooking($this->otherPractitioner, '10:00');

        $response = $this->actingAs($this->owner)->getJson('/bookings')->assertOk();

        $this->assertCount(2, $response->json('data'));
        $times = collect($response->json('data'))->pluck('booked_time')->all();
        $sorted = $times;
        sort($sorted);
        $this->assertSame($sorted, $times);
        $this->assertNotContains($this->otherPractitioner->id, collect($response->json('data'))->pluck('practitioner_id')->all());
    }

    public function test_index_filters_by_status(): void
    {
        $this->makeBooking($this->practitioner, '09:00');
        $this->makeBooking($this->practitioner, '10:00', 'cancelled');

        $response = $this->actingAs($this->owner)->getJson('/bookings?status=cancelled')->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame('cancelled', $response->json('data.0.status'));
    }

    public function test_can_mark_booking_completed(): void
    {
        $booking = $this->makeBooking($this->practitioner);

        $this->actingAs($this->owner)
            ->putJson("/bookings/{$booking->id}", ['status' => 'completed'])
            ->assertOk();

        $this->assertSame('completed', $booking->fresh()->status);
    }

    public function test_update_rejects_confirmed_and_garbage_status(): void
    {
        $booking = $this->makeBooking($this->practitioner);

        foreach (['confirmed', 'garbage'] as $status) {
            $this->actingAs($this->owner)
                ->putJson("/bookings/{$booking->id}", ['status' => $status])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('status');
        }
    }

    public function test_destroy_soft_cancels_and_is_idempotent(): void
    {
        $booking = $this->makeBooking($this->practitioner);

        $this->actingAs($this->owner)->deleteJson("/bookings/{$booking->id}")->assertNoContent();
        $this->actingAs($this->owner)->deleteJson("/bookings/{$booking->id}")->assertNoContent();

        $this->assertSame('cancelled', $booking->fresh()->status);
    }

    public function test_cannot_book_with_other_clinics_practitioner(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/bookings', $this->payload(['practitioner_id' => $this->otherPractitioner->id]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('practitioner_id');

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_cannot_update_or_delete_other_clinics_booking(): void
    {
        $booking = $this->makeBooking($this->otherPractitioner);

        $this->actingAs($this->owner)
            ->putJson("/bookings/{$booking->id}", ['status' => 'completed'])
            ->assertForbidden();

        $this->actingAs($this->owner)
            ->deleteJson("/bookings/{$booking->id}")
            ->assertForbidden();

        $this->assertSame('confirmed', $booking->fresh()->status);
    }

    public function test_guests_are_redirected_to_login(): void
    {
        $booking = $this->makeBooking($this->practitioner);

        $this->get('/bookings')->assertRedirect('/login');
        $this->post('/bookings', $this->payload())->assertRedirect('/login');
        $this->put("/bookings/{$booking->id}", ['status' => 'completed'])->assertRedirect('/login');
        $this->delete("/bookings/{$booking->id}")->assertRedirect('/login');
    }
}
