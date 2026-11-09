<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreBlockedTimeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->route('practitioner')->clinic_id === $this->user()->clinic->id;
    }

    public function rules(): array
    {
        return [
            'start_time' => ['required', 'date'],
            'end_time' => ['required', 'date', 'after:start_time'],
            'reason' => ['required', 'string', 'max:255'],
        ];
    }
}