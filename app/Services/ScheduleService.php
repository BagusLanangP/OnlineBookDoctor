<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Practitioner;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Jadwal praktek MINGGUAN satu dokter (Task 12). Dipakai bersama oleh halaman
 * Inertia lama (ScheduleWeekController) dan API Next.js (Api\ScheduleController),
 * supaya logika simpan hanya ada di satu tempat.
 *
 * Jam jadwal adalah jam LOKAL klinik ("09:00"), bukan UTC.
 */
class ScheduleService
{
    /** Batas daftar pasien terdampak di balasan (jumlah lengkapnya tetap dihitung). */
    public const OUTSIDE_LIMIT = 50;

    /**
     * Jadwal seminggu, urut Minggu (0) sampai Sabtu (6), jam "HH:mm".
     *
     * @return array<int, array{day_of_week: int, start_time: string, end_time: string}>
     */
    public function week(Practitioner $practitioner): array
    {
        return $practitioner->schedules()->orderBy('day_of_week')->get()->map(fn ($s) => [
            'day_of_week' => (int) $s->day_of_week,
            // getRawOriginal = nilai mentah DB ("09:00:00"); dipotong jadi "09:00".
            'start_time' => substr((string) $s->getRawOriginal('start_time'), 0, 5),
            'end_time' => substr((string) $s->getRawOriginal('end_time'), 0, 5),
        ])->values()->all();
    }

    /**
     * Membuat jadwal di DB PERSIS sama dengan $days (model "sinkronisasi", Task 8):
     * hari yang tidak dikirim = libur (dihapus), hari yang dikirim = ubah atau buat.
     * Semua dalam satu transaksi. Booking yang sudah ada TIDAK diubah.
     *
     * @param  array<int, array{day_of_week: int, start_time: string, end_time: string}>  $days
     */
    public function syncWeek(Practitioner $practitioner, array $days): void
    {
        DB::transaction(function () use ($practitioner, $days) {
            // whereNotIn dengan daftar kosong mengenai semua baris = libur seminggu.
            $practitioner->schedules()
                ->whereNotIn('day_of_week', collect($days)->pluck('day_of_week'))
                ->delete();

            foreach ($days as $day) {
                $practitioner->schedules()->updateOrCreate(
                    ['day_of_week' => $day['day_of_week']],
                    [
                        // Satu format tersimpan: "09:00" dan "09:00:00" jadi "09:00:00".
                        'start_time' => Carbon::parse($day['start_time'])->format('H:i:s'),
                        'end_time' => Carbon::parse($day['end_time'])->format('H:i:s'),
                    ],
                );
            }
        });
    }

    /**
     * Booking confirmed MENDATANG milik dokter ini yang tidak lagi muat di jadwalnya:
     * hari lokalnya libur, jam lokal sebelum jam mulai, atau slot 30 menitnya
     * melewati jam selesai (aturan "muat penuh" yang sama dengan AvailabilityService).
     * Dihitung dalam zona waktu klinik.
     *
     * @return array{0: int, 1: array<int, array{id: int, patient_name: string, patient_phone: string, booked_time: string}>}
     */
    public function outsideBookings(Practitioner $practitioner): array
    {
        $tz = $practitioner->clinic->timezone;
        $slot = AvailabilityService::SLOT_MINUTES;

        // Jam kerja per hari dalam menit sejak tengah malam: [dow => [mulai, selesai]].
        $hours = [];
        foreach ($this->week($practitioner) as $d) {
            $hours[$d['day_of_week']] = [self::minutes($d['start_time']), self::minutes($d['end_time'])];
        }

        $outside = Booking::where('practitioner_id', $practitioner->id)
            ->where('status', 'confirmed')
            ->where('booked_time', '>', now())
            ->orderBy('booked_time')
            ->get(['id', 'patient_name', 'patient_phone', 'booked_time'])
            ->filter(function (Booking $b) use ($tz, $hours, $slot) {
                $local = $b->booked_time->copy()->setTimezone($tz);
                $range = $hours[$local->dayOfWeek] ?? null;
                if ($range === null) {
                    return true;
                }
                $m = $local->hour * 60 + $local->minute;

                return $m < $range[0] || $m + $slot > $range[1];
            })
            ->values();

        $list = $outside->take(self::OUTSIDE_LIMIT)->map(fn (Booking $b) => [
            'id' => $b->id,
            'patient_name' => $b->patient_name,
            'patient_phone' => $b->patient_phone,
            'booked_time' => $b->booked_time->copy()->utc()->toIso8601ZuluString(),
        ])->all();

        return [$outside->count(), $list];
    }

    private static function minutes(string $hm): int
    {
        [$h, $m] = array_map('intval', explode(':', $hm));

        return $h * 60 + $m;
    }
}
