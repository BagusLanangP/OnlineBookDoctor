<?php

namespace Database\Seeders;

use App\Models\BlockedTime;
use App\Models\Booking;
use App\Models\Clinic;
use App\Models\Practitioner;
use App\Models\Schedule;
use Illuminate\Database\Seeder;

class ClinicSeeder extends Seeder
{
    public function run(): void
    {
        $clinic = Clinic::create([
            'name' => 'Klinik Maju Jaya',
            'phone' => '628123456789',
            'whatsapp_number' => '628123456789',
            'timezone' => 'Asia/Jakarta',
        ]);

        $drAhmad = Practitioner::create([
            'clinic_id' => $clinic->id,
            'name' => 'Dr. Ahmad Wijaya',
            'specialty' => 'General Practice',
        ]);

        $drSiti = Practitioner::create([
            'clinic_id' => $clinic->id,
            'name' => 'Dr. Siti Nurhaliza',
            'specialty' => 'General Practice',
        ]);

        for ($day = 1; $day <= 6; $day++) {
            Schedule::create([
                'practitioner_id' => $drAhmad->id,
                'day_of_week' => $day,
                'start_time' => '09:00:00',
                'end_time' => '17:00:00',
            ]);
        }

        for ($day = 1; $day <= 5; $day++) {
            Schedule::create([
                'practitioner_id' => $drSiti->id,
                'day_of_week' => $day,
                'start_time' => '08:00:00',
                'end_time' => '16:00:00',
            ]);
        }

        $today = now()->startOfDay();

        Booking::create([
            'practitioner_id' => $drAhmad->id,
            'patient_name' => 'Budi Santoso',
            'patient_phone' => '628987654321',
            'visit_reason' => 'Checkup',
            'booked_time' => $today->copy()->addDay()->setTime(10, 0),
            'status' => 'confirmed',
        ]);

        Booking::create([
            'practitioner_id' => $drAhmad->id,
            'patient_name' => 'Siti Rahma',
            'patient_phone' => '628987654322',
            'visit_reason' => 'Follow-up',
            'booked_time' => $today->copy()->addDay()->setTime(10, 30),
            'status' => 'confirmed',
        ]);

        Booking::create([
            'practitioner_id' => $drSiti->id,
            'patient_name' => 'Rudi Hermawan',
            'patient_phone' => '628987654323',
            'visit_reason' => 'Consultation',
            'booked_time' => $today->copy()->addDays(3)->setTime(14, 0),
            'status' => 'confirmed',
        ]);

        BlockedTime::create([
            'practitioner_id' => $drAhmad->id,
            'start_time' => $today->copy()->addDays(7)->startOfDay(),
            'end_time' => $today->copy()->addDays(13)->endOfDay(),
            'reason' => 'Annual Leave',
        ]);
    }
}
