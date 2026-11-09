<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateBookingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->route('booking')->practitioner->clinic_id === $this->user()->clinic->id;
    }

    public function rules(): array
    {
        return [
            'status' => ['required', Rule::in(['completed', 'cancelled'])],
        ];
    }
}