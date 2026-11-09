<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBookingRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'practitioner_id' => [
                'required',
                'integer',
                Rule::exists('practitioners', 'id')
                    ->where('clinic_id', $this->user()->clinic->id),
            ],
            'patient_name' => ['required', 'string', 'max:255'],
            'patient_phone' => ['required', 'regex:/^\d{8,15}$/'],
            'visit_reason' => ['required', 'string', 'max:255'],
            'booked_time' => ['required', 'date'],
        ];
    }
}