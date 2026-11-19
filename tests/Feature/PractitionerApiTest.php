<?php

namespace Tests\Feature;

use App\Models\Clinic;
use App\Models\Practitioner;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** GET /api/practitioners (Task 9b): daftar dokter klinik untuk dropdown filter. */
class PractitionerApiTest extends TestCase
{
    use RefreshDatabase;

    private function makeClinic(string $suffix): array
    {
        $user = User::factory()->create();

        $clinic = Clinic::create([
            'user_id' => $user->id,
            'name' => "Clinic $suffix",
            'phone' => "0811-$suffix",
            'whatsapp_number' => "62811-$suffix",
        ]);

        return [$user, $clinic];
    }

    private function addPractitioner(Clinic $clinic, string $name): Practitioner
    {
        return Practitioner::create([
            'clinic_id' => $clinic->id,
            'name' => $name,
            'specialty' => 'General',
        ]);
    }

    public function test_requires_login(): void
    {
        $this->getJson('/api/practitioners')->assertUnauthorized();
    }

    public function test_account_without_clinic_gets_403(): void
    {
        $this->actingAs(User::factory()->create());

        $this->getJson('/api/practitioners')->assertForbidden();
    }

    public function test_returns_only_own_clinic_practitioners_sorted_by_name(): void
    {
        [$user, $clinic] = $this->makeClinic('A');
        [, $other] = $this->makeClinic('B');
        $this->addPractitioner($clinic, 'Dr. Budi');
        $this->addPractitioner($clinic, 'Dr. Ayu');
        $this->addPractitioner($other, 'Dr. Milik B');
        $this->actingAs($user);

        $response = $this->getJson('/api/practitioners')->assertOk();

        $this->assertSame(['Dr. Ayu', 'Dr. Budi'], $response->json('*.name'));
    }

    public function test_each_item_has_only_id_name_and_specialty(): void
    {
        [$user, $clinic] = $this->makeClinic('A');
        $this->addPractitioner($clinic, 'Dr. Ayu');
        $this->actingAs($user);

        $item = $this->getJson('/api/practitioners')->assertOk()->json('0');

        $this->assertEqualsCanonicalizing(['id', 'name', 'specialty'], array_keys($item));
    }

    public function test_clinic_without_practitioners_returns_empty_array(): void
    {
        [$user] = $this->makeClinic('A');
        $this->actingAs($user);

        $this->getJson('/api/practitioners')->assertOk()->assertExactJson([]);
    }
}
