<?php

namespace Tests\Feature;

use App\Models\Clinic;
use App\Models\Practitioner;
use App\Models\Schedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScheduleTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Practitioner $practitioner;

    protected function setUp(): void
    {
        parent::setUp();

        [$this->owner, $this->practitioner] = $this->makeClinicWithPractitioner('A');
    }

    /**
     * Buat user + klinik + 1 practitioner. Suffix dipakai karena kolom
     * phone/whatsapp_number di tabel clinics unik.
     *
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

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'day_of_week' => 2,
            'start_time' => '09:00',
            'end_time' => '17:00',
        ], $overrides);
    }

    private function makeSchedule(Practitioner $practitioner, int $day = 2): Schedule
    {
        return Schedule::create([
            'practitioner_id' => $practitioner->id,
            'day_of_week' => $day,
            'start_time' => '09:00:00',
            'end_time' => '17:00:00',
        ]);
    }

    // 1
    public function test_owner_can_create_schedule(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/practitioners/{$this->practitioner->id}/schedules", $this->payload())
            ->assertCreated();

        $this->assertDatabaseHas('schedules', [
            'practitioner_id' => $this->practitioner->id,
            'day_of_week' => 2,
        ]);
    }

    public function test_owner_can_list_schedules(): void
    {
        $this->makeSchedule($this->practitioner, 1);
        $this->makeSchedule($this->practitioner, 2);

        $this->actingAs($this->owner)
            ->getJson("/practitioners/{$this->practitioner->id}/schedules")
            ->assertOk()
            ->assertJsonCount(2);
    }

    // 2
    public function test_owner_can_update_schedule_hours(): void
    {
        $schedule = $this->makeSchedule($this->practitioner);

        $this->actingAs($this->owner)
            ->putJson("/schedules/{$schedule->id}", [
                'start_time' => '10:00',
                'end_time' => '15:00',
            ])
            ->assertOk();

        // Bandingkan lewat model (cast datetime), bukan string mentah di DB,
        // karena API menyimpan format yang dikirim ("10:00" atau "10:00:00").
        $schedule->refresh();
        $this->assertSame('10:00', $schedule->start_time->format('H:i'));
        $this->assertSame('15:00', $schedule->end_time->format('H:i'));
    }

    // 3
    public function test_owner_can_delete_schedule(): void
    {
        $schedule = $this->makeSchedule($this->practitioner);

        $this->actingAs($this->owner)
            ->deleteJson("/schedules/{$schedule->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('schedules', ['id' => $schedule->id]);
    }

    // 4
    public function test_day_of_week_out_of_range_is_rejected(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/practitioners/{$this->practitioner->id}/schedules", $this->payload(['day_of_week' => 7]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('day_of_week');
    }

    // 5
    public function test_start_time_must_be_before_end_time(): void
    {
        foreach (['17:00', '18:00'] as $start) {
            $this->actingAs($this->owner)
                ->postJson("/practitioners/{$this->practitioner->id}/schedules", $this->payload([
                    'start_time' => $start,
                    'end_time' => '17:00',
                ]))
                ->assertUnprocessable()
                ->assertJsonValidationErrors('end_time');
        }
    }

    // 6
    public function test_duplicate_day_for_same_practitioner_is_rejected(): void
    {
        $this->makeSchedule($this->practitioner, 2);

        $this->actingAs($this->owner)
            ->postJson("/practitioners/{$this->practitioner->id}/schedules", $this->payload(['day_of_week' => 2]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('day_of_week');
    }

    public function test_same_day_is_allowed_for_a_different_practitioner(): void
    {
        $this->makeSchedule($this->practitioner, 2);

        $other = Practitioner::create([
            'clinic_id' => $this->practitioner->clinic_id,
            'name' => 'Dr. Second',
            'specialty' => 'General',
        ]);

        $this->actingAs($this->owner)
            ->postJson("/practitioners/{$other->id}/schedules", $this->payload(['day_of_week' => 2]))
            ->assertCreated();
    }

    // 7 — isolasi antar klinik
    public function test_cannot_touch_another_clinics_schedules(): void
    {
        [, $otherPractitioner] = $this->makeClinicWithPractitioner('B');
        $otherSchedule = $this->makeSchedule($otherPractitioner);

        $this->actingAs($this->owner);

        $this->getJson("/practitioners/{$otherPractitioner->id}/schedules")->assertForbidden();

        $this->postJson("/practitioners/{$otherPractitioner->id}/schedules", $this->payload(['day_of_week' => 4]))
            ->assertForbidden();

        $this->putJson("/schedules/{$otherSchedule->id}", ['start_time' => '10:00', 'end_time' => '11:00'])
            ->assertForbidden();

        $this->deleteJson("/schedules/{$otherSchedule->id}")->assertForbidden();

        // Data klinik B harus utuh.
        $this->assertDatabaseHas('schedules', [
            'id' => $otherSchedule->id,
            'start_time' => '09:00:00',
        ]);
        $this->assertDatabaseMissing('schedules', [
            'practitioner_id' => $otherPractitioner->id,
            'day_of_week' => 4,
        ]);
    }

    // 8
    public function test_guests_are_redirected_to_login(): void
    {
        $schedule = $this->makeSchedule($this->practitioner);

        $this->get("/practitioners/{$this->practitioner->id}/schedules")->assertRedirect('/login');
        $this->post("/practitioners/{$this->practitioner->id}/schedules", $this->payload())->assertRedirect('/login');
        $this->put("/schedules/{$schedule->id}", $this->payload())->assertRedirect('/login');
        $this->delete("/schedules/{$schedule->id}")->assertRedirect('/login');
    }
}
