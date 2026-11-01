<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Clinic extends Model
{
    protected $fillable = [
        'name',
        'phone',
        'whatsapp_number',
        'timezone',
    ];

    public function practitioners(): HasMany
    {
        return $this->hasMany(Practitioner::class);
    }
}
