<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateClinicRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Profil klinik milik pengguna (Task 11). Data ini nantinya dibaca pasien, jadi
 * balasan GET dan PUT sama bentuknya: Clinic::PROFILE_FIELDS.
 */
class ClinicController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json($request->user()->clinic->profile());
    }

    public function update(UpdateClinicRequest $request): JsonResponse
    {
        $clinic = $request->user()->clinic;
        $clinic->update($request->validated());

        return response()->json($clinic->fresh()->profile());
    }
}
