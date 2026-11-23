<?php

namespace App\Http\Requests;

use App\Models\Practitioner;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /api/practitioners dan PUT /api/practitioners/{practitioner} (Task 11).
 * Saat ubah, dokter harus milik klinik pengguna (selain itu 403), dan cek nama
 * unik mengabaikan dokter itu sendiri.
 */
class SavePractitionerRequest extends FormRequest
{
    public function authorize(): bool
    {
        $practitioner = $this->route('practitioner');

        return ! $practitioner instanceof Practitioner
            || $practitioner->clinic_id === $this->user()->clinic->id;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) {
            $this->merge(['name' => trim($this->input('name'))]);
        }
    }

    public function rules(): array
    {
        $practitioner = $this->route('practitioner');

        return [
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('practitioners', 'name')
                    ->where('clinic_id', $this->user()->clinic->id)
                    ->ignore($practitioner instanceof Practitioner ? $practitioner->id : null),
            ],
            'specialty' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Nama dokter wajib diisi.',
            'name.max' => 'Nama dokter paling banyak 255 karakter.',
            'name.unique' => 'Sudah ada dokter dengan nama ini di klinik Anda.',
            'specialty.max' => 'Spesialisasi paling banyak 255 karakter.',
        ];
    }
}
