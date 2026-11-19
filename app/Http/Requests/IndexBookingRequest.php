<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class IndexBookingRequest extends FormRequest
{
    // Otorisasi klinik sudah dijamin middleware has.clinic dan filter di query.
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Tanggal kalender klinik (bukan UTC). Tanpa parameter = semua tanggal.
            'date' => ['nullable', 'date_format:Y-m-d'],
        ];
    }
}
