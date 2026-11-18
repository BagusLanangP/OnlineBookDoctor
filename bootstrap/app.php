<?php

/*
|--------------------------------------------------------------------------
| bootstrap/app.php
|--------------------------------------------------------------------------
|
| OVERVIEW
| --------
| Ini file "rakitan" aplikasi Laravel 11+ (gaya konfigurasi baru). Laravel
| membacanya paling awal saat boot, sebelum satu pun request diproses.
| File ini TIDAK berisi logika bisnis; isinya hanya menjawab empat hal:
|   1. File rute mana yang dipakai (web, api, console, health check).
|   2. Middleware apa yang dipasang, dan di grup mana.
|   3. Bagaimana error ditampilkan (HTML atau JSON).
|   4. Alias middleware yang bisa dipakai di file rute.
|
| TUJUAN (Task 9a)
| ----------------
| Aplikasi ini punya DUA pintu masuk ke backend yang sama:
|   - Laravel + Inertia (React)  -> localhost:8088, lewat routes/web.php
|   - Next.js (frontend/)        -> localhost:3000, lewat routes/api.php
| Task 9a menambahkan pintu kedua. Perubahan di file ini:
|   a. `api:` pada withRouting      -> mendaftarkan routes/api.php (prefix /api).
|   b. `$middleware->statefulApi()` -> membuat login Next.js berbasis cookie
|                                      sesi (mode "SPA" Sanctum) bisa jalan.
| Rute web, middleware web, dan alias lama tidak diubah.
|
| ALUR REQUEST
| ------------
|   Browser (Next.js :3000)
|     1. GET  /sanctum/csrf-cookie  -> rute Sanctum (grup web): set cookie
|                                      XSRF-TOKEN + cookie sesi.
|     2. POST /api/login            -> routes/api.php
|          -> middleware (statefulApi: sesi + cookie + CSRF, karena Origin
|             cocok dengan sanctum.stateful)
|          -> Api\AuthController::login -> Auth::attempt -> sesi tersimpan.
|     3. GET  /api/user, /api/bookings
|          -> auth:sanctum membaca cookie sesi
|          -> has.clinic (alias di bawah) memastikan akun punya klinik
|          -> BookingController (sama dengan yang dipakai rute web)
|          -> error apa pun dibalas JSON (lihat withExceptions).
|
|   Browser (Laravel + Inertia :8088)
|     -> routes/web.php -> grup middleware `web` (+ HandleInertiaRequests).
|
| HUBUNGAN DENGAN FILE LAIN
| -------------------------
|   routes/web.php, routes/api.php   : rute yang didaftarkan di withRouting.
|   config/sanctum.php (stateful)    : daftar domain yang dianggap frontend
|                                      stateful oleh statefulApi().
|   config/cors.php                  : izin lintas origin :3000 -> :8088
|                                      (supports_credentials harus true).
|   app/Http/Middleware/*            : HandleInertiaRequests, EnsureUserHasClinic.
|   app/Http/Controllers/Api/AuthController.php : login, logout, me.
|   docs/TASK_9A_NEXTJS_API_AUTH_DESIGN.md      : desain lengkap task ini.
|
*/

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))

    // ---------------------------------------------------------------------
    // 1. ROUTING: file rute yang dimuat aplikasi.
    // ---------------------------------------------------------------------
    ->withRouting(
        // Rute halaman Laravel + Inertia. Otomatis memakai grup middleware `web`
        // (sesi, cookie, CSRF).
        web: __DIR__.'/../routes/web.php',

        // [Task 9a] Rute API untuk Next.js. Laravel otomatis menambahkan prefix
        // `/api` dan memakai grup middleware `api`. Dengan statefulApi() di
        // bawah, grup `api` mendapat sesi untuk request dari frontend.
        api: __DIR__.'/../routes/api.php',

        // Perintah Artisan berbasis closure.
        commands: __DIR__.'/../routes/console.php',

        // Endpoint cek kesehatan (GET /up) untuk Docker / load balancer.
        health: '/up',
    )

    // ---------------------------------------------------------------------
    // 2. MIDDLEWARE: filter yang dilewati request sebelum sampai controller.
    // ---------------------------------------------------------------------
    ->withMiddleware(function (Middleware $middleware): void {
        // [Task 9a] Mode "SPA" Sanctum.
        //
        // Bawaan Laravel: rute API itu stateless (tanpa sesi dan cookie), cocok
        // untuk token tetapi tidak untuk login cookie. statefulApi() menyisipkan
        // middleware sesi, enkripsi cookie, dan perlindungan CSRF ke grup `api`,
        // TAPI hanya untuk request yang `Origin`/`Referer`-nya ada di
        // `sanctum.stateful` (default: localhost:3000). Request lain (Postman,
        // aplikasi pihak ketiga) tetap stateless.
        //
        // Tanpa baris ini, Auth::attempt() di AuthController tidak punya sesi:
        // login tampak berhasil, tetapi request berikutnya dianggap belum login.
        $middleware->statefulApi();

        // Tambahan untuk grup `web` (halaman Laravel + Inertia). Tidak terkait
        // Next.js dan tidak diubah di Task 9a.
        $middleware->web(append: [
            // Membagikan data bersama (user, flash message) ke halaman Inertia.
            \App\Http\Middleware\HandleInertiaRequests::class,
            // Menambah header Link agar aset Vite dimuat lebih awal (preload).
            \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
        ]);

        // Alias singkat untuk dipakai di file rute: ->middleware('has.clinic').
        // Menolak (403) akun yang belum terhubung ke klinik. Dipakai di rute web
        // dan di /api/bookings; /api/user sengaja tanpa alias ini supaya akun
        // tanpa klinik tetap bisa mengecek dirinya.
        $middleware->alias([
            'has.clinic' => \App\Http\Middleware\EnsureUserHasClinic::class,
        ]);
    })

    // ---------------------------------------------------------------------
    // 3. EXCEPTIONS: bentuk respons ketika terjadi error.
    // ---------------------------------------------------------------------
    ->withExceptions(function (Exceptions $exceptions): void {
        // Request ke /api/* (atau yang meminta JSON) selalu dibalas JSON.
        // Contoh: tanpa login -> 401 JSON, validasi gagal -> 422 JSON. Tanpa ini,
        // Laravel membalas redirect ke halaman login, yang tidak berguna bagi
        // Next.js karena ia butuh status code dan isi JSON.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
