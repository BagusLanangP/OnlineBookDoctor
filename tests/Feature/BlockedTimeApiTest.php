<?php

namespace Tests\Feature;

use App\Models\BlockedTime;
use App\Models\Booking;
use App\Models\Clinic;
use App\Models\Practitioner;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Rute blocked-times di /api (untuk Next.js, Task 10): dilindungi auth:sanctum
 * + has.clinic, jadi tanpa login membalas 401 JSON (bukan redirect seperti rute web).
 * Logika controller sudah diuji di BlockedTimeTest lewat rute web; di sini hanya
 * memastikan jalur /api terpasang, terlindungi, dan memakai controller yang sama.
 *
 * actingAs() biasa, bukan Sanctum::actingAs(), seperti ApiAuthTest.
 */
class BlockedTimeApiTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Practitioner $practitioner;

    private Practitioner $otherPractitioner;

    protected function setUp(): void
    {
        parent::setUp();

        [$this->owner, $this->practitioner] = $this->makeClinicWithPractitioner('A');
        [, $this->otherPractitioner] = $this->makeClinicWithPractitioner('B');
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

    private function url(Practitioner $practitioner): string
    {
        return '/api/practitioners/'.$practitioner->id.'/blocked-times';
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'start_time' => '2030-01-07T10:00:00Z',
            'end_time' => '2030-01-07T12:00:00Z',
            'reason' => 'Rapat',
        ], $overrides);
    }

    private function makeBlock(Practitioner $practitioner, string $start = '2030-01-07T10:00:00Z', string $end = '2030-01-07T12:00:00Z'): BlockedTime
    {
        return BlockedTime::create([
            'practitioner_id' => $practitioner->id,
            'start_time' => Carbon::parse($start),
            'end_time' => Carbon::parse($end),
            'reason' => 'Libur',
        ]);
    }

    public function test_create_block_via_api_returns_201_with_conflicts(): void
    {
        $booking = Booking::create([
            'practitioner_id' => $this->practitioner->id,
            'patient_name' => 'Budi',
            'patient_phone' => '6281234560105',
            'visit_reason' => 'Checkup',
            'booked_time' => Carbon::parse('2030-01-07T10:30:00Z'),
            'status' => 'confirmed',
        ]);

        $this->actingAs($this->owner)
            ->postJson($this->url($this->practitioner), $this->payload())
            ->assertCreated()
            ->assertJsonPath('reason', 'Rapat')
            ->assertJsonPath('conflicting_bookings', 1)
            ->assertJsonPath('conflicts.0.id', $booking->id)
            ->assertJsonPath('conflicts.0.patient_name', 'Budi')
            ->assertJsonPath('conflicts.0.patient_phone', '6281234560105');

        $this->assertDatabaseCount('blocked_times', 1);
    }

    public function test_validation_error_via_api_is_422_json(): void
    {
        $this->actingAs($this->owner)
            ->postJson($this->url($this->practitioner), $this->payload(['end_time' => '2030-01-07T09:00:00Z']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('end_time');
    }

    public function test_list_via_api_returns_paginator_and_upcoming_filter(): void
    {
        $upcoming = $this->makeBlock($this->practitioner);
        $this->makeBlock($this->practitioner, '2020-01-01T10:00:00Z', '2020-01-01T12:00:00Z'); // sudah lewat

        $all = $this->actingAs($this->owner)
            ->getJson($this->url($this->practitioner))
            ->assertOk()
            ->assertJsonStructure(['data', 'current_page', 'last_page', 'total']);
        $this->assertSame(2, $all->json('total'));

        $only = $this->actingAs($this->owner)
            ->getJson($this->url($this->practitioner).'?upcoming=1')
            ->assertOk();
        $this->assertSame([$upcoming->id], collect($only->json('data'))->pluck('id')->all());
    }

    public function test_delete_via_api_returns_204_and_second_delete_is_404(): void
    {
        $block = $this->makeBlock($this->practitioner);

        $this->actingAs($this->owner)
            ->deleteJson('/api/blocked-times/'.$block->id)
            ->assertNoContent();
        $this->assertDatabaseCount('blocked_times', 0);

        // Hapus kedua kali: binding model menjawab 404 sebelum controller jalan.
        // Frontend menganggapnya "sudah terhapus" lalu memuat ulang daftar.
        $this->actingAs($this->owner)
            ->deleteJson('/api/blocked-times/'.$block->id)
            ->assertNotFound();
    }

    public function test_guests_get_401_json_not_a_redirect(): void
    {
        $block = $this->makeBlock($this->practitioner);

        $this->getJson($this->url($this->practitioner))->assertUnauthorized();
        $this->postJson($this->url($this->practitioner), $this->payload())->assertUnauthorized();
        $this->deleteJson('/api/blocked-times/'.$block->id)->assertUnauthorized();

        $this->assertDatabaseCount('blocked_times', 1);
    }

    public function test_account_without_clinic_gets_403(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson($this->url($this->practitioner))
            ->assertForbidden();
    }

    public function test_cannot_touch_another_clinics_practitioner_or_block(): void
    {
        $foreignBlock = $this->makeBlock($this->otherPractitioner);

        $this->actingAs($this->owner)
            ->getJson($this->url($this->otherPractitioner))
            ->assertForbidden();

        $this->actingAs($this->owner)
            ->postJson($this->url($this->otherPractitioner), $this->payload())
            ->assertForbidden();

        $this->actingAs($this->owner)
            ->deleteJson('/api/blocked-times/'.$foreignBlock->id)
            ->assertForbidden();

        $this->assertDatabaseCount('blocked_times', 1);
    }
}
