<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Booking extends Model
{
    protected $fillable = [
        'practitioner_id',
        'patient_name',
        'patient_phone',
        'visit_reason',
        'booked_time',
        'status',
    ];

    protected $casts = [
        'booked_time' => 'datetime',
    ];

    public function practitioner(): BelongsTo
    {
        return $this->belongsTo(Practitioner::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', '!=', 'cancelled');
    }

    public function scopeUpcoming(Builder $query): Builder
    {
        return $query->where('booked_time', '>', now())
                     ->where('status', '!=', 'cancelled');
    }
}
