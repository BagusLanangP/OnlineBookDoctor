<?php

namespace App\Repositories\Eloquent;

use App\Models\Practitioner;
use App\Repositories\Contracts\PractitionerRepositoryInterface;

class EloquentPractitionerRepository implements PractitionerRepositoryInterface
{
    // :Practitioner return type declaration (deklarasi tipe kembalian).
    public function findWithClinic(int $id): Practitioner
    {
        // Persis baris pertama di store() sekarang.
        return Practitioner::with('clinic')->findOrFail($id);
    }
}

