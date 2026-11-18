<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Clinic;
use App\Models\Practitioner;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Tes API untuk Next.js (Task 9a): login, user, bookings, logout.
 *
 * User tidak memakai HasApiTokens (mode cookie), jadi login di test memakai
 * actingAs() biasa, bukan Sanctum::actingAs(). Perlindungan CSRF dilewati saat test, jadi tidak diuji di sini
 * (uji manual dengan curl atau browser, lihat docs/TASK_9A_NEXTJS_API_AUTH_DESIGN.md).
 */
class ApiAuthTest extends TestCase
{
    use RefreshDatabase;

    /** Origin frontend; membuat Sanctum memperlakukan request sebagai stateful (ada sesi). */
    private const ORIGIN = 'http://localhost:3000';

    /** @return array{0: User, 1: Clinic, 2: Practitioner} */
    private function makeClinic(string $suffix = 'A'): array
    {
        $user = User::factory()->create(['password' => bcrypt('password')]);

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

        return [$user, $clinic, $practitioner];
    }

    private function makeBooking(Practitioner $practitioner, string $name, int $hours = 24): Booking
    {
        return Booking::create([
            'practitioner_id' => $practitioner->id,
            'patient_name' => $name,
            'patient_phone' => '628111111111',
            'visit_reason' => 'Checkup',
            'booked_time' => Carbon::now('UTC')->addHours($hours),
            'status' => 'confirmed',
        ]);
    }

    private function login(string $email, string $password)
    {
        return $this->withHeaders(['Origin' => self::ORIGIN])
            ->postJson('/api/login', ['email' => $email, 'password' => $password]);
    }

    public function test_login_with_correct_credentials_returns_no_content(): void
    {
        [$user] = $this->makeClinic();

        $this->login($user->email, 'password')->assertNoContent();

        $this->assertAuthenticatedAs($user);
    }

    public function test_login_with_wrong_password_returns_validation_error_on_email(): void
    {
        [$user] = $this->makeClinic();

        $this->login($user->email, 'salah')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->assertGuest();
    }

    public function test_login_is_rate_limited_after_repeated_failures(): void
    {
        [$user] = $this->makeClinic();

        for ($i = 0; $i < 5; $i++) {
            $this->login($user->email, 'salah')->assertUnprocessable();
        }

        // Percobaan ke-6 ditolak lebih dulu, bahkan dengan password yang benar.
        $response = $this->login($user->email, 'password')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->assertStringContainsString('seconds', $response->json('errors.email.0'));
        $this->assertGuest();
    }

    public function test_user_endpoint_without_login_returns_401_json(): void
    {
        $this->getJson('/api/user')->assertUnauthorized()->assertJsonStructure(['message']);
    }

    public function test_user_endpoint_returns_user_and_clinic(): void
    {
        [$user, $clinic] = $this->makeClinic();
        $this->actingAs($user);

        $this->getJson('/api/user')
            ->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.email', $user->email)
            ->assertJsonPath('clinic.id', $clinic->id)
            ->assertJsonPath('clinic.name', 'Clinic A')
            ->assertJsonMissingPath('user.password');
    }

    public function test_user_endpoint_returns_null_clinic_when_account_has_none(): void
    {
        $this->actingAs(User::factory()->create());

        $this->getJson('/api/user')
            ->assertOk()
            ->assertJsonPath('clinic', null);
    }

    public function test_bookings_without_login_returns_401(): void
    {
        $this->getJson('/api/bookings')->assertUnauthorized();
    }

    public function test_bookings_without_clinic_returns_403(): void
    {
        $this->actingAs(User::factory()->create());

        $this->getJson('/api/bookings')->assertForbidden();
    }

    public function test_bookings_returns_same_data_as_web_route(): void
    {
        [$user, , $practitioner] = $this->makeClinic();
        $this->makeBooking($practitioner, 'Budi', 24);
        $this->makeBooking($practitioner, 'Ayu', 26);
        $this->actingAs($user);

        $api = $this->getJson('/api/bookings')->assertOk();
        $web = $this->getJson('/bookings')->assertOk();

        $this->assertCount(2, $api->json('data'));
        $this->assertSame($web->json('data'), $api->json('data'));
    }

    public function test_bookings_never_include_other_clinics(): void
    {
        [$user, , $practitioner] = $this->makeClinic('A');
        [, , $otherPractitioner] = $this->makeClinic('B');
        $this->makeBooking($practitioner, 'Milik A');
        $this->makeBooking($otherPractitioner, 'Milik B');
        $this->actingAs($user);

        $names = collect($this->getJson('/api/bookings')->assertOk()->json('data'))->pluck('patient_name');

        $this->assertSame(['Milik A'], $names->all());
    }

    public function test_logout_ends_the_session(): void
    {
        [$user] = $this->makeClinic();

        $this->login($user->email, 'password')->assertNoContent();
        $this->withHeaders(['Origin' => self::ORIGIN])->getJson('/api/user')->assertOk();

        $this->withHeaders(['Origin' => self::ORIGIN])->postJson('/api/logout')->assertNoContent();

        // Reset guard yang di-cache antar request dalam satu test.
        $this->app['auth']->forgetGuards();

        $this->withHeaders(['Origin' => self::ORIGIN])->getJson('/api/user')->assertUnauthorized();
    }
}
