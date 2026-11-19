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
 * Filter tanggal GET /api/bookings (Task 9b).
 *
 * `date` adalah tanggal kalender KLINIK, sedangkan booked_time tersimpan dalam UTC.
 * Klinik Asia/Jakarta (UTC+7): 2026-11-18 = [2026-11-17 17:00Z, 2026-11-18 17:00Z).
 */
class BookingDateFilterTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: Clinic, 2: Practitioner} */
    private function makeClinic(string $suffix = 'A', string $timezone = 'Asia/Jakarta'): array
    {
        $user = User::factory()->create();

        $clinic = Clinic::create([
            'user_id' => $user->id,
            'name' => "Clinic $suffix",
            'phone' => "0811-$suffix",
            'whatsapp_number' => "62811-$suffix",
            'timezone' => $timezone,
        ]);

        $practitioner = Practitioner::create([
            'clinic_id' => $clinic->id,
            'name' => "Dr. $suffix",
            'specialty' => 'General',
        ]);

        return [$user, $clinic, $practitioner];
    }

    private function makeBooking(
        Practitioner $practitioner,
        string $name,
        string $utc,
        string $status = 'confirmed',
    ): Booking {
        return Booking::create([
            'practitioner_id' => $practitioner->id,
            'patient_name' => $name,
            'patient_phone' => '628111111111',
            'visit_reason' => 'Checkup',
            'booked_time' => Carbon::parse($utc, 'UTC'),
            'status' => $status,
        ]);
    }

    /** @return array<int, string> nama pasien, terurut */
    private function names(string $url): array
    {
        $names = collect($this->getJson($url)->assertOk()->json('data'))->pluck('patient_name')->all();
        sort($names);

        return $names;
    }

    public function test_date_returns_only_bookings_on_that_clinic_local_day(): void
    {
        [$user, , $practitioner] = $this->makeClinic();
        $this->makeBooking($practitioner, 'Hari-17', '2026-11-17 10:00:00'); // 17:00 tgl 17 lokal
        $this->makeBooking($practitioner, 'Hari-18', '2026-11-18 03:00:00'); // 10:00 tgl 18 lokal
        $this->makeBooking($practitioner, 'Hari-19', '2026-11-19 03:00:00'); // 10:00 tgl 19 lokal
        $this->actingAs($user);

        $this->assertSame(['Hari-18'], $this->names('/api/bookings?date=2026-11-18'));
    }

    public function test_day_boundaries_are_half_open_in_clinic_timezone(): void
    {
        [$user, , $practitioner] = $this->makeClinic();
        $this->makeBooking($practitioner, 'Sebelum', '2026-11-17 16:59:59'); // 23:59:59 tgl 17 lokal
        $this->makeBooking($practitioner, 'Awal', '2026-11-17 17:00:00');    // 00:00:00 tgl 18 lokal
        $this->makeBooking($practitioner, 'Akhir', '2026-11-18 16:59:59');   // 23:59:59 tgl 18 lokal
        $this->makeBooking($practitioner, 'Sesudah', '2026-11-18 17:00:00'); // 00:00:00 tgl 19 lokal
        $this->actingAs($user);

        $this->assertSame(['Akhir', 'Awal'], $this->names('/api/bookings?date=2026-11-18'));
    }

    public function test_date_uses_the_clinic_timezone_not_utc_or_jakarta(): void
    {
        // Asia/Makassar = UTC+8: 2026-11-18 = [2026-11-17 16:00Z, 2026-11-18 16:00Z).
        [$user, , $practitioner] = $this->makeClinic('A', 'Asia/Makassar');
        $this->makeBooking($practitioner, 'Masuk-awal', '2026-11-17 16:30:00');  // Jakarta: tgl 17
        $this->makeBooking($practitioner, 'Keluar-akhir', '2026-11-18 16:30:00'); // Jakarta: tgl 18
        $this->actingAs($user);

        $this->assertSame(['Masuk-awal'], $this->names('/api/bookings?date=2026-11-18'));
    }

    public function test_date_combines_with_status_and_practitioner_filters(): void
    {
        [$user, $clinic, $practitioner] = $this->makeClinic();
        $second = Practitioner::create([
            'clinic_id' => $clinic->id,
            'name' => 'Dr. Kedua',
            'specialty' => 'General',
        ]);
        $this->makeBooking($practitioner, 'Dr1-confirmed', '2026-11-18 03:00:00');
        $this->makeBooking($practitioner, 'Dr1-cancelled', '2026-11-18 04:00:00', 'cancelled');
        $this->makeBooking($second, 'Dr2-confirmed', '2026-11-18 03:00:00');
        $this->makeBooking($practitioner, 'Dr1-lain-hari', '2026-11-19 03:00:00');
        $this->actingAs($user);

        $this->assertSame(
            ['Dr1-cancelled'],
            $this->names('/api/bookings?date=2026-11-18&status=cancelled'),
        );
        $this->assertSame(
            ['Dr2-confirmed'],
            $this->names("/api/bookings?date=2026-11-18&practitioner_id={$second->id}"),
        );
    }

    public function test_without_date_all_bookings_are_returned(): void
    {
        [$user, , $practitioner] = $this->makeClinic();
        $this->makeBooking($practitioner, 'Satu', '2026-11-17 03:00:00');
        $this->makeBooking($practitioner, 'Dua', '2026-11-18 03:00:00');
        $this->actingAs($user);

        $this->assertSame(['Dua', 'Satu'], $this->names('/api/bookings'));
    }

    public function test_date_filter_never_leaks_other_clinics(): void
    {
        [$user, , $practitioner] = $this->makeClinic('A');
        [, , $otherPractitioner] = $this->makeClinic('B');
        $this->makeBooking($practitioner, 'Milik-A', '2026-11-18 03:00:00');
        $this->makeBooking($otherPractitioner, 'Milik-B', '2026-11-18 03:00:00');
        $this->actingAs($user);

        $this->assertSame(['Milik-A'], $this->names('/api/bookings?date=2026-11-18'));
        // practitioner_id klinik lain: kosong, bukan data klinik lain.
        $this->assertSame([], $this->names("/api/bookings?date=2026-11-18&practitioner_id={$otherPractitioner->id}"));
    }

    public function test_invalid_date_format_returns_422(): void
    {
        [$user] = $this->makeClinic();
        $this->actingAs($user);

        foreach (['18-11-2026', 'abc', '2026-02-30', '2026-11-18 10:00'] as $bad) {
            $this->getJson('/api/bookings?date='.urlencode($bad))
                ->assertUnprocessable()
                ->assertJsonValidationErrors('date');
        }
    }

    public function test_pagination_links_keep_the_filters(): void
    {
        [$user, , $practitioner] = $this->makeClinic();
        // 21 booking pada tanggal lokal 18 (01:00Z, 01:10Z, ...), 20 per halaman.
        for ($i = 0; $i < 21; $i++) {
            $this->makeBooking(
                $practitioner,
                "P$i",
                Carbon::parse('2026-11-18 01:00:00', 'UTC')->addMinutes($i * 10)->toDateTimeString(),
            );
        }
        $this->actingAs($user);

        $response = $this->getJson('/api/bookings?date=2026-11-18&status=confirmed')->assertOk();

        $this->assertCount(20, $response->json('data'));
        $next = (string) $response->json('next_page_url');
        $this->assertStringContainsString('date=2026-11-18', $next);
        $this->assertStringContainsString('status=confirmed', $next);
    }
}
