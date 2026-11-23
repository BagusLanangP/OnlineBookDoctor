<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Clinic extends Model
{
    /** Zona waktu yang boleh dipilih di profil klinik (WIB, WITA, WIT). */
    public const TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'];

    /** Kolom yang dikirim GET/PUT /api/clinic. */
    public const PROFILE_FIELDS = [
        'id', 'name', 'description', 'address', 'city', 'maps_url',
        'phone', 'whatsapp_number', 'timezone',
    ];

    protected $fillable = [
        'user_id',
        'name',
        'description',
        'address',
        'city',
        'maps_url',
        'phone',
        'whatsapp_number',
        'timezone',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Menormalkan nomor telepon Indonesia ke digit "62...":
     * "0812-3456" -> "628123456", "+62 812" -> "62812", "0062..." -> "62...".
     * Nilai yang bukan teks dikembalikan apa adanya supaya validasi menolaknya.
     */
    public static function normalizePhone(mixed $phone): mixed
    {
        if (! is_string($phone)) {
            return $phone;
        }
        $digits = preg_replace('/\D/', '', $phone);
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        } elseif (str_starts_with($digits, '0')) {
            $digits = '62'.substr($digits, 1);
        }

        return $digits;
    }

    /** @return array<string, mixed> */
    public function profile(): array
    {
        return $this->only(self::PROFILE_FIELDS);
    }

    public function practitioners(): HasMany
    {
        return $this->hasMany(Practitioner::class);
    }
}
