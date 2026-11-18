<?php

/*
|--------------------------------------------------------------------------
| config/cors.php
|--------------------------------------------------------------------------
|
| OVERVIEW
| --------
| CORS (Cross-Origin Resource Sharing) adalah aturan browser: halaman dari satu
| "origin" (skema + host + port) hanya boleh membaca respons dari origin lain
| jika server tujuan mengizinkannya lewat header `Access-Control-*`.
|
| Di proyek ini ada dua origin:
|   - Next.js (frontend)  : http://localhost:3000
|   - Laravel (API)       : http://localhost:8088
| Port beda = origin beda, jadi tanpa izin dari file ini browser memblokir
| semua fetch dari Next.js ke Laravel, walau servernya sendiri membalas 200.
|
| TUJUAN (Task 9a)
| ----------------
| Mengizinkan Next.js memanggil Laravel DENGAN membawa cookie sesi. Dua nilai
| di bawah diubah dari bawaan framework untuk itu:
|   - allowed_origins      : ['*']  ->  hanya FRONTEND_URL
|   - supports_credentials : false  ->  true
|
| ALUR
| ----
|   1. Untuk request "rumit" (POST JSON + header X-XSRF-TOKEN), browser lebih
|      dulu mengirim request `OPTIONS` (preflight): "boleh tidak saya kirim ini?"
|   2. Laravel (HandleCors, middleware bawaan) menjawab memakai nilai di file ini.
|   3. Jika origin cocok dan credentials diizinkan, browser mengirim request
|      aslinya beserta cookie, lalu mengizinkan JavaScript membaca responsnya.
|
| HUBUNGAN DENGAN FILE LAIN
| -------------------------
|   .env / .env.example              : FRONTEND_URL (alamat Next.js).
|   frontend/lib/api.ts              : memakai `credentials: "include"`; tanpa
|                                      supports_credentials=true browser menolak.
|   config/sanctum.php (stateful)    : urusan lain (siapa yang mendapat sesi),
|                                      tetapi domain frontend-nya harus konsisten
|                                      dengan FRONTEND_URL.
|   bootstrap/app.php                : statefulApi() dan routes/api.php.
|
*/

return [

    // Jalur URL yang diberi header CORS. Selain ini (halaman web biasa) tidak.
    //   api/*                : semua endpoint API (login, user, bookings, ...).
    //   sanctum/csrf-cookie  : rute Sanctum yang dipanggil Next.js sebelum login;
    //                          tanpa ini cookie XSRF-TOKEN tidak bisa diterima.
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // [Task 9a] Origin yang boleh memanggil API. Harus ditulis spesifik, tidak
    // boleh '*': browser menolak kombinasi '*' dengan supports_credentials=true.
    // Tulis tanpa garis miring di akhir dan harus sama persis dengan origin
    // browser (localhost dan 127.0.0.1 dianggap BERBEDA).
    'allowed_origins' => [env('FRONTEND_URL', 'http://localhost:3000')],

    'allowed_origins_patterns' => [],

    // Header yang boleh dikirim browser, termasuk X-XSRF-TOKEN (perlindungan CSRF),
    // Content-Type, dan Accept.
    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    // Lama (detik) browser boleh menyimpan hasil preflight. 0 = tanya setiap kali.
    'max_age' => 0,

    // [Task 9a] Mengirim header `Access-Control-Allow-Credentials: true`, yang
    // membuat browser mau menyertakan cookie sesi pada request lintas origin dan
    // memberikan respons-nya ke JavaScript. Wajib untuk login berbasis cookie.
    'supports_credentials' => true,

];
