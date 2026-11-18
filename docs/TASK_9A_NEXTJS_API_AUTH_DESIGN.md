# Task 9a: Fondasi API dan Login untuk Next.js

**Deliverable:** Frontend Next.js (`localhost:3000`) bisa masuk ke akun klinik lewat Laravel (`localhost:8088`) dan memanggil `GET /api/bookings` dengan sesi yang sama. Belum ada halaman daftar booking; itu Task 9c.
**Dependencies:** Refactor Booking (`BookingService`), homepage Next.js (`frontend/`), Task 5 (API booking).
**Estimasi:** 3-4 jam (backend kecil, dua halaman Next.js, test).
**Status:** panduan untuk dikerjakan sendiri. Belum ada kode yang ditulis, dan langkah-langkah di bawah belum saya jalankan. Fakta di bagian "Fakta dari kode" saya baca langsung dari proyek dan `vendor/`.

Task 9 dipecah tiga: **9a** (dokumen ini) fondasi login/API, **9b** filter tanggal di repository dan service, **9c** halaman daftar booking di Next.js.

---

## Sketch

```
Next.js (localhost:3000)                      Laravel (localhost:8088)

1. GET  /sanctum/csrf-cookie ───────────────▶ set cookie XSRF-TOKEN + sesi
2. POST /api/login                            Auth::attempt → login lewat sesi
        (X-XSRF-TOKEN, credentials) ────────▶ balas 204
3. GET  /api/user  (cookie sesi) ───────────▶ { user, clinic }
4. GET  /api/bookings ──────────────────────▶ JSON (controller yang sama dengan web)
```

Tidak ada token yang disimpan di browser. Yang dipakai adalah cookie sesi Laravel (mode "SPA" Sanctum).

---

## Fakta dari kode (sudah diperiksa)

| Hal | Kondisi |
|---|---|
| Versi | Laravel 13.39, Sanctum 4.3.3, Breeze (Inertia) |
| `routes/api.php` | **Belum ada.** `bootstrap/app.php` hanya mendaftarkan `web`, `commands`, `health` |
| `config/sanctum.php` | Belum dipublikasikan. Bawaan vendor sudah menganggap `localhost:3000` sebagai domain *stateful*, guard `['web']` |
| `config/cors.php` | **Belum ada.** Bawaan framework: `allowed_origins => ['*']` dan `supports_credentials => false`, **tidak cukup** untuk cookie lintas origin |
| CSRF | Laravel 13 memakai `PreventRequestForgery`. `$allowSameSite = false`, jadi POST dari `:3000` (yang berstatus *same-site*, bukan *same-origin*) **wajib** membawa header `X-XSRF-TOKEN`. Middleware ini dilewati saat test, jadi CSRF tidak bisa dites otomatis |
| Respons error | `bootstrap/app.php` sudah memaksa JSON untuk `api/*`, jadi 401/422 berupa JSON |
| Session | `SESSION_DRIVER=database`, `SESSION_DOMAIN=null`, `same_site=lax` |
| Model `User` | Tanpa `HasApiTokens` (tidak perlu untuk mode cookie), tidak `MustVerifyEmail` |
| Rute `/sanctum/csrf-cookie` | Sudah didaftarkan Sanctum otomatis (grup `web`) |
| Login Breeze | `POST /login` membalas **redirect**, bukan JSON, jadi tidak cocok dipanggil dari Next.js |
| `LoginRequest` Breeze | Punya `authenticate()` dengan pembatasan percobaan (rate limit), bisa dipakai ulang |

---

## ⚠️ Keputusan yang Perlu Ditinjau Sebelum Menulis Kode

### 1. Cookie sesi (Sanctum SPA), bukan token
Cookie sesi lebih aman karena tidak ada token di `localStorage` yang bisa dicuri lewat XSS. Syaratnya frontend dan API berada di *registrable domain* yang sama (lokal: `localhost`; produksi misalnya `app.contoh.id` dan `api.contoh.id`). **Rekomendasi:** cookie sesi.

### 2. Rute API baru memakai controller yang sama
`routes/api.php` memetakan `/api/bookings` ke `BookingController` yang sudah ada. Rute web lama tidak disentuh, sehingga seluruh test lama tetap hijau. Yang digandakan adalah rute, bukan logika.

### 3. Endpoint login sendiri, bukan memanggil `/login` Breeze
`Api\AuthController::login` memakai `LoginRequest::authenticate()` dan membalas `204`. Dengan begitu rate limit Breeze ikut terpakai.

### 4. Hanya endpoint yang dibutuhkan Task 9 yang dibuka
Login, logout, `user`, dan `bookings`. Jadwal, blokir waktu, dan daftar dokter ditunda. **Catatan:** Task 9c butuh `GET /api/practitioners` untuk dropdown, dan itu belum ada (daftar dokter sekarang hanya lewat props Inertia).

### 5. `/api/user` tanpa `has.clinic`
Akun yang belum punya klinik (kasus nyata: pendaftaran di Laravel tidak membuat klinik) harus tetap bisa mengecek dirinya, supaya Next.js menampilkan pesan yang jelas. Endpoint bookings tetap memakai `has.clinic`.

### 6. Tidak ada registrasi lewat API
Akun baru belum otomatis punya klinik, jadi mendaftar dari Next.js hanya menghasilkan akun yang berujung 403. Perbaiki alur klinik dulu di pekerjaan terpisah.

### 7. Link "Masuk" di homepage tetap ke Laravel sampai 9c selesai
Halaman login Next.js di 9a hanya untuk membuktikan alurnya. Setelah 9c, baru link homepage diganti.

### 8. Hanya untuk lokal: cookie dibagi antar port
Cookie terikat ke *host*, bukan port, jadi cookie sesi dari `localhost:8088` ikut terkirim saat `localhost:3000` memanggil `localhost:8088`. Di produksi butuh `SESSION_DOMAIN=.contoh.id` dan `SANCTUM_STATEFUL_DOMAINS`.

---

## Struktur File

```
app/Http/Controllers/Api/AuthController.php   (baru)
routes/api.php                                (baru)
bootstrap/app.php                             (ubah: api routing + statefulApi)
config/cors.php                               (baru, dipublikasikan lalu diubah)
.env.example                                  (ubah: FRONTEND_URL)
tests/Feature/ApiAuthTest.php                 (baru)

frontend/lib/api.ts                           (baru)
frontend/app/login/page.tsx                   (baru)
frontend/app/akun/page.tsx                    (baru)
frontend/.env.example                         (ubah: NEXT_PUBLIC_API_URL)
```

---

## Langkah 1: Backend

### 1a. Daftarkan rute API dan mode stateful

`bootstrap/app.php`:
```php
->withRouting(
    web: __DIR__.'/../routes/web.php',
    api: __DIR__.'/../routes/api.php',      // baru
    commands: __DIR__.'/../routes/console.php',
    health: '/up',
)
->withMiddleware(function (Middleware $middleware): void {
    // Permintaan dari domain frontend (lihat sanctum.stateful) mendapat sesi + cookie
    // seperti rute web. Tanpa ini, Auth::attempt tidak punya sesi.
    $middleware->statefulApi();             // baru

    $middleware->web(append: [ ... ]);
    ...
```
Setelah mengubah ini, buat file `routes/api.php` kosong dulu (`<?php`) agar aplikasi tidak error saat boot.

### 1b. CORS

```bash
php artisan config:publish cors
```
Ubah dua nilai di `config/cors.php`:
```php
'allowed_origins' => [env('FRONTEND_URL', 'http://localhost:3000')],
'supports_credentials' => true,
```
`supports_credentials => true` **tidak boleh** dipasangkan dengan `'*'` (browser menolak), itu sebabnya origin harus ditulis spesifik. Pastikan `paths` memuat `api/*` dan `sanctum/csrf-cookie`.

`.env.example` (dan `.env`):
```
FRONTEND_URL=http://localhost:3000
```

### 1c. Controller auth

`app/Http/Controllers/Api/AuthController.php`:
```php
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
```

### 1d. Rute

`routes/api.php`:
```php
<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\BookingController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'me']);

    Route::middleware('has.clinic')->group(function () {
        Route::get('/bookings', [BookingController::class, 'index']);
        Route::post('/bookings', [BookingController::class, 'store']);
        Route::put('/bookings/{booking}', [BookingController::class, 'update']);
        Route::delete('/bookings/{booking}', [BookingController::class, 'destroy']);
    });
});
```
Cek hasilnya dengan `php artisan route:list --path=api`.

---

## Langkah 2: Frontend Next.js

Pakai **Client Component** untuk dua halaman ini. Cookie sesi hanya ada di browser, sedangkan mengambil data di server (dengan meneruskan cookie) adalah topik 9c.

### 2a. Environment
`frontend/.env.example` dan `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8088
```
Pakai `localhost` di kedua sisi, **jangan** campur dengan `127.0.0.1`: itu host berbeda sehingga cookie tidak terkirim.

### 2b. Pembungkus fetch: `frontend/lib/api.ts`
```ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8088";

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`);
  }
}

// Cookie XSRF-TOKEN ditulis Laravel dan boleh dibaca JavaScript (sesi-nya tidak).
function xsrfToken(): string | undefined {
  const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

export async function ensureCsrfCookie() {
  await fetch(`${BASE}/sanctum/csrf-cookie`, { credentials: "include" });
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const writes = method !== "GET";

  if (writes && !xsrfToken()) await ensureCsrfCookie();

  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    credentials: "include", // kirim cookie sesi lintas origin
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(writes ? { "X-XSRF-TOKEN": xsrfToken() ?? "" } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}
```
Tiga hal yang perlu dipahami: `credentials: "include"` mengirim cookie lintas origin, header `X-XSRF-TOKEN` adalah pasangan dari cookie `XSRF-TOKEN` (Laravel membandingkan keduanya), dan `204` tidak punya isi sehingga tidak boleh di-`.json()`.

### 2c. Halaman login: `frontend/app/login/page.tsx`
Komponen klien dengan dua isian (`email`, `password`). Saat submit:
1. `await ensureCsrfCookie()`
2. `await api("/login", { method: "POST", body: JSON.stringify({ email, password }) })`
3. berhasil: `router.push("/akun")` (`useRouter` dari `next/navigation`)
4. `ApiError` berstatus 422: tampilkan `body.errors.email[0]`

Gunakan tombol dan gaya yang sama dengan homepage (kelas `.btn`).

### 2d. Halaman akun: `frontend/app/akun/page.tsx`
Komponen klien. Di `useEffect`, panggil `api("/user")`:
- 401: `router.replace("/login")`
- sukses dan `clinic` ada: tampilkan "Halo, {user.name}" dan nama klinik
- sukses tapi `clinic` null: tampilkan pesan "Akun ini belum terhubung ke klinik"
- tombol **Keluar** memanggil `api("/logout", { method: "POST" })`, lalu ke `/login`

Tambahkan juga satu tombol sementara "Uji bookings" yang memanggil `api("/bookings")` dan menampilkan jumlah datanya. Ini bukti bahwa Next.js benar-benar bisa membaca API yang dilindungi, dan boleh dihapus di 9c.

---

## Testing Checklist

### Otomatis (`tests/Feature/ApiAuthTest.php`)
Kirim header `Origin: http://localhost:3000` pada permintaan login, supaya Sanctum memperlakukannya sebagai *stateful* (tanpa itu `$request->session()` tidak ada dan `Auth::attempt` gagal). Untuk rute yang sudah login pakai `Sanctum::actingAs($user)`.

- [ ] Login benar: 204
- [ ] Password salah: 422 dengan error di `email`
- [ ] Percobaan berulang: kena rate limit (429/422 sesuai `LoginRequest`)
- [ ] `GET /api/user` tanpa login: **401 JSON** (bukan redirect)
- [ ] `GET /api/user` dengan klinik: berisi `user` dan `clinic`
- [ ] `GET /api/user` tanpa klinik: `clinic` bernilai `null`
- [ ] `GET /api/bookings` tanpa login: 401; tanpa klinik: 403; dengan klinik: 200 dan datanya sama dengan rute web
- [ ] Booking klinik lain tidak pernah muncul
- [ ] Logout: setelahnya `/api/user` kembali 401
- [ ] `php artisan test` seluruhnya tetap hijau (test web lama tidak diedit)

### Manual (CSRF tidak bisa dites otomatis)
Akun seeder: `admin@klinikmajujaya.test` / `password`.
```bash
# 1. ambil cookie CSRF
curl -i -c jar.txt -H "Origin: http://localhost:3000" http://localhost:8088/sanctum/csrf-cookie

# 2. login (tanpa X-XSRF-TOKEN harus gagal 419, dengan token harus 204)
curl -i -b jar.txt -c jar.txt -H "Origin: http://localhost:3000" \
  -H "Accept: application/json" -H "X-XSRF-TOKEN: <isi cookie XSRF-TOKEN yang sudah di-decode>" \
  -d "email=admin@klinikmajujaya.test&password=password" http://localhost:8088/api/login

# 3. cek
curl -b jar.txt -H "Origin: http://localhost:3000" -H "Accept: application/json" http://localhost:8088/api/user
```
- [ ] Di browser: buka `localhost:3000/login`, login, sampai di `/akun`, nama dan klinik tampil
- [ ] Tab Network: permintaan lintas origin tidak diblokir CORS (cek header `Access-Control-Allow-Credentials: true`)
- [ ] Muat ulang `/akun`: tetap login. Klik Keluar: kembali ke `/login`
- [ ] Tombol "Uji bookings" menampilkan jumlah booking klinik

---

## Kriteria Selesai
- Login dari `localhost:3000` berhasil dan sesinya bertahan setelah muat ulang.
- `GET /api/user` dan `GET /api/bookings` bisa dibaca dari Next.js.
- Rute web dan semua test lama tidak berubah.
- Tidak ada token yang disimpan di `localStorage`.

## Yang TIDAK Dikerjakan Task Ini
- Halaman daftar booking dan filter tanggal (9b dan 9c).
- Endpoint jadwal, blokir waktu, dan daftar dokter.
- Registrasi lewat API (alur klinik belum ada).
- Konfigurasi produksi (`SESSION_DOMAIN`, domain stateful, cookie `secure`).
- Mengganti link "Masuk" di homepage.

## Catatan Produksi (tidak dikerjakan sekarang)
Cookie `secure` dan HTTPS, `SESSION_DOMAIN` ke domain induk, `SANCTUM_STATEFUL_DOMAINS` berisi domain frontend, dan `FRONTEND_URL` ke alamat produksi. Tanpa itu login tidak akan jalan di luar localhost.

## Langkah Berikutnya
- **9b:** filter tanggal di `BookingRepository::search` dan `BookingService::list` (konversi tanggal lokal klinik ke UTC), plus `GET /api/practitioners`.
- **9c:** halaman daftar booking di Next.js: tabel, filter, aksi selesai dan batal, dengan ambil data di Server atau Client Component sesuai yang kamu putuskan.
