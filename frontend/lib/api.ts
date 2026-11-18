// URL dasar backend Laravel. Ambil dari .env.local (NEXT_PUBLIC_API_URL),
// fallback ke localhost:8088. Semua request API menggunakan BASE ini sebagai prefix.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8088";

// Custom error class untuk respons error dari backend Laravel (401, 422, 500, dsb).
// Menyimpan HTTP status dan body respons agar mudah ditangani di frontend.
// Contoh: catch (err) { if (err instanceof ApiError) { console.log(err.status, err.body) } }
export class ApiError extends Error {
  constructor(
    public status: number,  // HTTP status code (401, 422, 500, dsb)
    public body: unknown    // JSON respons dari backend (misalnya {errors: {email: ['...']}} untuk 422)
  ) {
    // Pesan error standar: "API 422", "API 401", dsb
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

// Pembungkus fetch untuk memanggil API backend Laravel. Menangani:
// - penentuan HTTP method (GET, POST, PUT, DELETE)
// - pengambilan dan pengiriman CSRF token untuk perlindungan
// - pengiriman cookie sesi lintas origin
// - parsing respons dan error handling
//
// Contoh pakai:
//   await api("/login", { method: "POST", body: JSON.stringify({...}) })
//   const user = await api<User>("/user")
//   await api("/bookings/1", { method: "DELETE" })
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  // Tentukan HTTP method. Default GET jika tidak dikirim.
  const method = (init.method ?? "GET").toUpperCase();
  // Tandai apakah ini operasi tulis (POST, PUT, DELETE) atau baca (GET).
  const writes = method !== "GET";

  // Untuk operasi tulis, pastikan cookie CSRF sudah ada. Jika belum,
  // panggil /sanctum/csrf-cookie untuk mendapatkannya sebelum request sesungguhnya.
  if (writes && !xsrfToken()) await ensureCsrfCookie();

  // Buat request fetch ke backend.
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,  // Copy init parameter (method, body, dsb)
    // Penting untuk mode SPA Sanctum: kirim cookie sesi meski lintas origin.
    credentials: "include",
    headers: {
      // Header standar JSON API.
      Accept: "application/json",
      "Content-Type": "application/json",
      // Untuk operasi tulis, tambah header XSRF-TOKEN (perlindungan CSRF).
      // Laravel membandingkan header ini dengan cookie XSRF-TOKEN untuk memastikan
      // request datang dari aplikasi milik sendiri, bukan dari website jahat.
      ...(writes ? { "X-XSRF-TOKEN": xsrfToken() ?? "" } : {}),
      ...init.headers,  // Izinkan override header dari parameter.
    },
  });

  // Respons 204 (No Content) tidak punya body, jadi jangan parse JSON.
  if (res.status === 204) return undefined as T;

  // Parse JSON respons. Jika parse gagal (misalnya respons HTML error), set ke null.
  const body = await res.json().catch(() => null);

  // Jika respons tidak OK (401, 422, 500, dsb), lempar ApiError supaya bisa
  // di-catch dan ditampilkan ke user.
  if (!res.ok) throw new ApiError(res.status, body);

  // Sukses: return body (data dari backend).
  return body as T;
}