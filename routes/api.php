<?php

/*
|--------------------------------------------------------------------------
| routes/api.php
|--------------------------------------------------------------------------
|
| OVERVIEW
| --------
| File ini mendaftarkan semua rute API untuk Next.js (localhost:3000).
| Semua rute di sini otomatis mendapat prefix /api dan memakai grup
| middleware `api` (stateless secara default, tetapi dengan statefulApi()
| di bootstrap/app.php menjadi stateful untuk request dari frontend).
|
| ALUR REQUEST
| -----------
|   Browser Next.js      Middleware              Controller
|   POST /api/login  ->  (statefulApi, CSRF)  ->  Api\AuthController::login
|   GET  /api/user   ->  auth:sanctum         ->  Api\AuthController::me
|   GET  /api/bookings-> auth:sanctum + has.clinic -> BookingController::index
|
| HUBUNGAN DENGAN FILE LAIN
| -------------------------
|   bootstrap/app.php        : mendaftarkan file ini sebagai api routing.
|   config/cors.php          : izin lintas origin dari Next.js.
|   app/Http/Middleware/*    : middleware yang dipakai rute.
|   app/Http/Controllers/Api/* : logika request.
|
*/

// Impor class-class yang dipakai di file ini. Tanpa `use`, harus nulis full
// namespace (contoh: Illuminate\Support\Facades\Route::post(...)), tapi itu
// panjang. `use` adalah alias: PHP mengartikan `Route::` sebagai
// `Illuminate\Support\Facades\Route::`.
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PractitionerController;
use App\Http\Controllers\BookingController;
use Illuminate\Support\Facades\Route;

// Route::post(...) adalah method static dari class Route (Facade). Facade adalah
// pola Laravel untuk mengakses class yang lebih dalam lewat interface sederhana.
// Di balik layar, Route::post() memanggil RouteRegistrar->post() dengan magic.
// Hasilnya adalah rute POST /api/login yang menjalankan Api\AuthController::login().
Route::post('/login', [AuthController::class, 'login']);

// Grup rute yang dilindungi middleware auth:sanctum. Tanpa token/sesi yang valid,
// middleware ini membalas 401 JSON (bukan redirect, karena ini API).
// Rute di dalam grup ini:
//   - tidak boleh dipanggil tanpa login
//   - akan menerima sesi dan user data
Route::middleware('auth:sanctum')->group(function () {
    // Logout: hapus sesi, balas 204 No Content.
    Route::post('/logout', [AuthController::class, 'logout']);

    // GET /api/user: tampilkan data user + clinic mereka (atau null).
    // Tidak memakai middleware has.clinic agar akun tanpa klinik tetap bisa
    // mengecek dirinya (untuk error handling yang lebih baik di frontend).
    Route::get('/user', [AuthController::class, 'me']);

    // Grup rute dalam rute: tambahan middleware has.clinic. Rute booking
    // memerlukan auth:sanctum (dari grup luar) DAN has.clinic (dari grup dalam).
    Route::middleware('has.clinic')->group(function () {
        // CRUD booking untuk klinik milik user. Semua dijamin hanya melihat
        // booking milik klinik mereka sendiri (filter di BookingController).
        Route::get('/bookings', [BookingController::class, 'index']);
        Route::post('/bookings', [BookingController::class, 'store']);
        Route::put('/bookings/{booking}', [BookingController::class, 'update']);
        Route::delete('/bookings/{booking}', [BookingController::class, 'destroy']);

        // Daftar dokter klinik untuk dropdown filter.
        Route::get('/practitioners', [PractitionerController::class, 'index']);
    });
});
