<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SavePractitionerRequest;
use App\Models\Practitioner;
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

    // Tambah dokter (Task 11). Nama unik per klinik (lihat SavePractitionerRequest).
    public function store(SavePractitionerRequest $request): JsonResponse
    {
        $practitioner = $request->user()->clinic->practitioners()->create($request->validated());

        return response()->json($practitioner->only(['id', 'name', 'specialty']), 201);
    }

    // Ubah nama/spesialisasi. Dokter klinik lain ditolak 403 oleh Form Request.
    public function update(SavePractitionerRequest $request, Practitioner $practitioner): JsonResponse
    {
        $practitioner->update($request->validated());

        return response()->json($practitioner->only(['id', 'name', 'specialty']));
    }

    /**
     * Hapus dokter. Keputusan 1 (opsi A): hanya boleh bila dokter belum punya
     * booking SAMA SEKALI, karena tabel bookings memakai cascadeOnDelete dan
     * menghapus dokter akan ikut menghapus riwayat pasien. Jadwal dan blokir
     * miliknya tetap ikut terhapus (bukan data pasien).
     */
    public function destroy(Request $request, Practitioner $practitioner): JsonResponse
    {
        abort_unless($practitioner->clinic_id === $request->user()->clinic->id, 403);

        $count = $practitioner->bookings()->count();
        if ($count > 0) {
            return response()->json([
                'message' => "Dokter ini punya {$count} booking, jadi tidak bisa dihapus.",
                'bookings_count' => $count,
            ], 409);
        }

        $practitioner->delete();

        return response()->json(status: 204);
    }
}
