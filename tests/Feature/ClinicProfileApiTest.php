<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Clinic;
use App\Models\Practitioner;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Task 11: profil klinik (GET/PUT /api/clinic) dan kelola dokter
 * (POST/PUT/DELETE /api/practitioners). actingAs() biasa seperti ApiAuthTest.
 */
class ClinicProfileApiTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Clinic $clinic;

    private Clinic $otherClinic;

    protected function setUp(): void
    {
        parent::setUp();

        [$this->owner, $this->clinic] = $this->makeClinic('A', '628111111111');
        [, $this->otherClinic] = $this->makeClinic('B', '628222222222');
    }

    /** @return array{0: User, 1: Clinic} */
    private function makeClinic(string $suffix, string $phone): array
    {
        $user = User::factory()->create();

        $clinic = Clinic::create([
            'user_id' => $user->id,
            'name' => "Clinic $suffix",
            'phone' => $phone,
            'whatsapp_number' => $phone,
            'timezone' => 'Asia/Jakarta',
        ]);

        return [$user, $clinic];
    }

    private function addPractitioner(Clinic $clinic, string $name): Practitioner
    {
        return Practitioner::create(['clinic_id' => $clinic->id, 'name' => $name, 'specialty' => 'Umum']);
    }

    private function profile(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Klinik Maju Jaya',
            'description' => 'Klinik umum keluarga.',
            'address' => 'Jl. Teuku Umar No. 10',
            'city' => 'Denpasar',
            'maps_url' => 'https://maps.app.goo.gl/abc',
            'phone' => '0812-3456-7890',
            'whatsapp_number' => '+62 812 3456 7891',
            'timezone' => 'Asia/Makassar',
        ], $overrides);
    }

    // --- GET /api/clinic ---------------------------------------------------

    public function test_clinic_requires_login(): void
    {
        $this->getJson('/api/clinic')->assertUnauthorized();
        $this->putJson('/api/clinic', $this->profile())->assertUnauthorized();
    }

    public function test_account_without_clinic_gets_403(): void
    {
        $this->actingAs(User::factory()->create());

        $this->getJson('/api/clinic')->assertForbidden();
        $this->putJson('/api/clinic', $this->profile())->assertForbidden();
    }

    public function test_show_returns_own_clinic_profile_fields_only(): void
    {
        $this->actingAs($this->owner);

        $json = $this->getJson('/api/clinic')->assertOk()->json();

        $this->assertEqualsCanonicalizing(Clinic::PROFILE_FIELDS, array_keys($json));
        $this->assertSame($this->clinic->id, $json['id']);
        $this->assertNull($json['address']);
    }

    // --- PUT /api/clinic ---------------------------------------------------

    public function test_update_saves_profile_and_normalizes_numbers(): void
    {
        $this->actingAs($this->owner);

        $this->putJson('/api/clinic', $this->profile())
            ->assertOk()
            ->assertJson([
                'name' => 'Klinik Maju Jaya',
                'city' => 'Denpasar',
                'phone' => '6281234567890',
                'whatsapp_number' => '6281234567891',
                'timezone' => 'Asia/Makassar',
            ]);

        $this->assertDatabaseHas('clinics', [
            'id' => $this->clinic->id,
            'address' => 'Jl. Teuku Umar No. 10',
            'phone' => '6281234567890',
        ]);
    }

    public function test_optional_fields_can_be_cleared(): void
    {
        $this->clinic->update(['city' => 'Denpasar']);
        $this->actingAs($this->owner);

        $this->putJson('/api/clinic', $this->profile(['city' => '', 'description' => null, 'maps_url' => '']))
            ->assertOk()
            ->assertJson(['city' => null, 'description' => null, 'maps_url' => null]);
    }

    public function test_number_used_by_another_clinic_is_rejected_in_any_format(): void
    {
        $this->actingAs($this->owner);

        // Klinik B memakai 628222222222; "0822 2222 222" adalah nomor yang sama.
        $this->putJson('/api/clinic', $this->profile(['phone' => '0822 2222 222']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['phone']);
    }

    public function test_own_numbers_can_be_saved_again(): void
    {
        $this->actingAs($this->owner);

        $this->putJson('/api/clinic', $this->profile([
            'phone' => '0811 1111 111',
            'whatsapp_number' => '628111111111',
        ]))->assertOk();
    }

    public function test_invalid_number_is_rejected(): void
    {
        $this->actingAs($this->owner);

        $this->putJson('/api/clinic', $this->profile(['phone' => '123', 'whatsapp_number' => '']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['phone', 'whatsapp_number']);
    }

    public function test_timezone_outside_list_is_rejected(): void
    {
        $this->actingAs($this->owner);

        $this->putJson('/api/clinic', $this->profile(['timezone' => 'UTC']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['timezone']);
    }

    public function test_maps_url_must_be_https(): void
    {
        $this->actingAs($this->owner);

        $this->putJson('/api/clinic', $this->profile(['maps_url' => 'http://maps.example.com']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['maps_url']);
    }

    public function test_name_is_required_and_lengths_are_limited(): void
    {
        $this->actingAs($this->owner);

        $this->putJson('/api/clinic', $this->profile([
            'name' => '',
            'description' => str_repeat('a', 301),
            'city' => str_repeat('a', 101),
        ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'description', 'city']);
    }

    // --- Dokter ------------------------------------------------------------

    public function test_practitioner_routes_require_login(): void
    {
        $p = $this->addPractitioner($this->clinic, 'Dr. Ayu');

        $this->postJson('/api/practitioners', ['name' => 'Dr. Baru'])->assertUnauthorized();
        $this->putJson("/api/practitioners/{$p->id}", ['name' => 'X'])->assertUnauthorized();
        $this->deleteJson("/api/practitioners/{$p->id}")->assertUnauthorized();
    }

    public function test_can_add_practitioner(): void
    {
        $this->actingAs($this->owner);

        $this->postJson('/api/practitioners', ['name' => '  Dr. Ayu  ', 'specialty' => 'Anak'])
            ->assertCreated()
            ->assertJson(['name' => 'Dr. Ayu', 'specialty' => 'Anak']);

        $this->assertDatabaseHas('practitioners', ['clinic_id' => $this->clinic->id, 'name' => 'Dr. Ayu']);
    }

    public function test_specialty_is_optional(): void
    {
        $this->actingAs($this->owner);

        $this->postJson('/api/practitioners', ['name' => 'Dr. Ayu', 'specialty' => ''])
            ->assertCreated()
            ->assertJson(['specialty' => null]);
    }

    public function test_duplicate_name_in_same_clinic_is_rejected_but_allowed_in_other_clinic(): void
    {
        $this->addPractitioner($this->clinic, 'Dr. Ayu');
        $this->addPractitioner($this->otherClinic, 'Dr. Budi');
        $this->actingAs($this->owner);

        $this->postJson('/api/practitioners', ['name' => 'Dr. Ayu'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);

        $this->postJson('/api/practitioners', ['name' => 'Dr. Budi'])->assertCreated();
    }

    public function test_can_update_practitioner_keeping_own_name(): void
    {
        $p = $this->addPractitioner($this->clinic, 'Dr. Ayu');
        $this->actingAs($this->owner);

        $this->putJson("/api/practitioners/{$p->id}", ['name' => 'Dr. Ayu', 'specialty' => 'Gigi'])
            ->assertOk()
            ->assertJson(['id' => $p->id, 'name' => 'Dr. Ayu', 'specialty' => 'Gigi']);
    }

    public function test_update_to_existing_name_is_rejected(): void
    {
        $this->addPractitioner($this->clinic, 'Dr. Ayu');
        $p = $this->addPractitioner($this->clinic, 'Dr. Budi');
        $this->actingAs($this->owner);

        $this->putJson("/api/practitioners/{$p->id}", ['name' => 'Dr. Ayu'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_other_clinic_practitioner_is_forbidden(): void
    {
        $p = $this->addPractitioner($this->otherClinic, 'Dr. B');
        $this->actingAs($this->owner);

        $this->putJson("/api/practitioners/{$p->id}", ['name' => 'Dr. Curian'])->assertForbidden();
        $this->deleteJson("/api/practitioners/{$p->id}")->assertForbidden();
        $this->assertDatabaseHas('practitioners', ['id' => $p->id, 'name' => 'Dr. B']);
    }

    public function test_delete_practitioner_without_bookings(): void
    {
        $p = $this->addPractitioner($this->clinic, 'Dr. Ayu');
        $this->actingAs($this->owner);

        $this->deleteJson("/api/practitioners/{$p->id}")->assertNoContent();
        $this->assertDatabaseMissing('practitioners', ['id' => $p->id]);
    }

    public function test_delete_practitioner_with_bookings_is_refused_and_bookings_kept(): void
    {
        $p = $this->addPractitioner($this->clinic, 'Dr. Ayu');
        foreach (['2030-01-07 03:00:00', '2030-01-08 03:00:00'] as $i => $time) {
            Booking::create([
                'practitioner_id' => $p->id,
                'patient_name' => "Pasien $i",
                'patient_phone' => '628987654321',
                'visit_reason' => 'Kontrol',
                'booked_time' => $time,
                'status' => $i === 0 ? 'completed' : 'cancelled',
            ]);
        }
        $this->actingAs($this->owner);

        $this->deleteJson("/api/practitioners/{$p->id}")
            ->assertStatus(409)
            ->assertJson(['bookings_count' => 2]);

        $this->assertDatabaseHas('practitioners', ['id' => $p->id]);
        $this->assertDatabaseCount('bookings', 2);
    }
}
