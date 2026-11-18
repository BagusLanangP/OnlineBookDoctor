<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    public function login(LoginRequest $request): Response
    {
        // Rate limit dan pesan error (422) sudah ditangani LoginRequest.
        $request->authenticate();

        // Ganti id sesi setelah login (mencegah session fixation).
        $request->session()->regenerate();

        return response()->noContent();
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'user' => $user->only(['id', 'name', 'email']),
            // null bila akun belum terhubung ke klinik.
            'clinic' => $user->clinic?->only(['id', 'name', 'timezone']),
        ]);
    }
}