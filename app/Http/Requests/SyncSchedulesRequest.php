<?php

// Lokasi logis class ini (sesuai folder app/Http/Requests)
namespace App\Http\Requests;

// Import class dasar Form Request bawaan Laravel
use Illuminate\Foundation\Http\FormRequest;

/**
 * Form Request untuk menyinkronkan (mengganti seluruh) jadwal mingguan practitioner.
 *
 * Alur: Laravel menjalankan authorize() lebih dulu, lalu rules().
 * Jika authorize() false -> 403. Jika validasi gagal -> 422.
 * Jika lolos, controller menerima data bersih lewat $request->validated().
 */
class SyncSchedulesRequest extends FormRequest
{
    /**
     * Cek apakah user boleh melakukan aksi ini.
     * Practitioner di URL harus berasal dari klinik yang sama dengan user yang login,
     * sehingga admin klinik A tidak bisa mengubah jadwal practitioner klinik B.
     */
    public function authorize(): bool
    {
        // {practitioner} dari route (model binding) -> clinic_id-nya dibandingkan dengan klinik user login
        return $this->route('practitioner')->clinic_id === $this->user()->clinic->id;
    }

    /**
     * Aturan validasi untuk data yang dikirim.
     * Tanda * artinya aturan berlaku untuk setiap elemen array.
     */
    public function rules(): array
    {
        return [
            // present: key wajib ada tapi boleh kosong; array: harus array; max:7: maksimal 7 hari
            'schedules' => ['present', 'array', 'max:7'],          // [] = every day off

            // Hari dalam seminggu: wajib, bilangan bulat 0-6 (0 = Minggu ... 6 = Sabtu),
            // distinct: tidak boleh ada hari yang sama dua kali dalam satu request
            'schedules.*.day_of_week' => ['required', 'integer', 'between:0,6', 'distinct'],

            // Jam mulai: wajib, format "09:00" (H:i) atau "09:00:00" (H:i:s)
            'schedules.*.start_time' => ['required', 'date_format:H:i,H:i:s'],

            // Jam selesai: wajib, format sama, dan harus lebih besar dari start_time pada item yang sama
            'schedules.*.end_time' => ['required', 'date_format:H:i,H:i:s', 'after:schedules.*.start_time'],
        ];
    }
}
