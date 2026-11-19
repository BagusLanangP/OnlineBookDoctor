<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PractitionerController extends Controller
{
    // Daftar dokter klinik yang login, untuk dropdown filter di Next.js.
    // Array biasa (bukan paginator): jumlah dokter per klinik kecil.
    public function index(Request $request): JsonResponse
    {
        return response()->json(
            $request->user()->clinic->practitioners()
                ->orderBy('name')
                ->get(['id', 'name', 'specialty'])
        );
    }
}
