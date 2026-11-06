<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->route('practitioner')->clinic_id === $this->user()->clinic->id;
    }

    public function rules(): array
    {
        $practitionerId = $this->route('practitioner')->id;

        return [
            'day_of_week' => [
                'required',
                'integer',
                'between:0,6',
                Rule::unique('schedules')->where('practitioner_id', $practitionerId),
            ],
            'start_time' => ['required', 'date_format:H:i,H:i:s'],
            'end_time' => ['required', 'date_format:H:i,H:i:s', 'after:start_time'],
        ];
    }
}