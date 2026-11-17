<?php

namespace App\Repositories\Contracts;
use App\Models\Practitioner;

interface PractitionerRepositoryInterface
{
    // Kembalikan practitioner beserta relasi clinic-nya.
    // Dibutuhkan karena service perlu timezone klinik.
    // Kalau tidak ditemukan, lempar ModelNotFoundException (sama seperti findOrFail sekarang).
    public function findWithClinic(int $id): Practitioner;
}