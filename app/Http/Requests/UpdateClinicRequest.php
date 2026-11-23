<?php

namespace App\Http\Requests;

use App\Models\Clinic;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** PUT /api/clinic (Task 11): profil klinik milik pengguna yang login. */
class UpdateClinicRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Middleware has.clinic sudah memastikan klinik ada.
        return $this->user()->clinic !== null;
    }

    /**
     * Nomor dinormalkan SEBELUM validasi supaya cek unik membandingkan bentuk
     * yang sama ("0812..." dan "62812..." dianggap nomor yang sama). Teks kosong
     * opsional diubah ke null oleh middleware bawaan Laravel.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'phone' => Clinic::normalizePhone($this->input('phone')),
            'whatsapp_number' => Clinic::normalizePhone($this->input('whatsapp_number')),
        ]);
    }

    public function rules(): array
    {
        $clinicId = $this->user()->clinic->id;
        $phone = ['required', 'string', 'regex:/^62\d{8,13}$/'];

        return [
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:300'],
            'address' => ['nullable', 'string', 'max:500'],
            'city' => ['nullable', 'string', 'max:100'],
            'maps_url' => ['nullable', 'string', 'max:2048', 'url:https'],
            'phone' => [...$phone, Rule::unique('clinics', 'phone')->ignore($clinicId)],
            'whatsapp_number' => [...$phone, Rule::unique('clinics', 'whatsapp_number')->ignore($clinicId)],
            'timezone' => ['required', Rule::in(Clinic::TIMEZONES)],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Nama klinik wajib diisi.',
            'name.max' => 'Nama klinik paling banyak 255 karakter.',
            'description.max' => 'Deskripsi paling banyak 300 karakter.',
            'address.max' => 'Alamat paling banyak 500 karakter.',
            'city.max' => 'Kota paling banyak 100 karakter.',
            'maps_url.url' => 'Tautan peta harus alamat https://.',
            'maps_url.max' => 'Tautan peta terlalu panjang.',
            'phone.required' => 'Nomor telepon wajib diisi.',
            'phone.regex' => 'Nomor telepon harus 10-15 digit, contoh 0812 3456 7890.',
            'phone.unique' => 'Nomor telepon ini sudah dipakai klinik lain.',
            'whatsapp_number.required' => 'Nomor WhatsApp wajib diisi.',
            'whatsapp_number.regex' => 'Nomor WhatsApp harus 10-15 digit, contoh 0812 3456 7890.',
            'whatsapp_number.unique' => 'Nomor WhatsApp ini sudah dipakai klinik lain.',
            'timezone.required' => 'Zona waktu wajib dipilih.',
            'timezone.in' => 'Pilih zona waktu WIB, WITA, atau WIT.',
        ];
    }
}
