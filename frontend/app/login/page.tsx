"use client";

// Halaman masuk (Task 9a). Alur Sanctum SPA: minta cookie CSRF, kirim email dan
// kata sandi ke /api/login (balasan 204), lalu pindah ke /akun. Tidak ada token
// yang disimpan di browser; sesinya adalah cookie milik Laravel.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { LogoMark } from "@/components/Logo";
import { ApiError, api, ensureCsrfCookie } from "@/lib/api";

// Gaya fokus, error, dan transisi ada di kelas .field (globals.css).
const FIELD =
  "field mt-2 block w-full";

// Ambil pesan yang layak ditampilkan dari error API.
function messageFrom(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { errors?: { email?: string[] }; message?: string } | null;
    if (err.status === 422 && body?.errors?.email?.[0]) return body.errors.email[0];
    if (err.status === 419) return "Sesi keamanan kedaluwarsa. Muat ulang halaman lalu coba lagi.";
    if (err.status === 429) return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
    return "Terjadi kesalahan di server. Coba lagi nanti.";
  }
  return "Tidak bisa terhubung ke server. Pastikan Laravel berjalan, lalu coba lagi.";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      await ensureCsrfCookie();
      await api("/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/bookings");
    } catch (err) {
      setError(messageFrom(err));
      setLoading(false);
      // Setelah salah sandi, langkah berikutnya hampir selalu mengetik ulang sandi.
      passwordRef.current?.focus();
    }
  }

  return (
    <main className="login">
      <aside className="login__brand">
        <Link href="/" aria-label="Praktika, ke beranda" className="login__logo">
          <LogoMark size={44} inverse />
        </Link>
        <p className="login__statement">
          <span className="block">Satu slot,</span>
          <span className="block">satu pasien.</span>
        </p>
      </aside>

      <section className="login__panel">
        <div className="login__form">
        <h1 className="login__title">Masuk ke Praktika</h1>
        <p className="login__lede">Atur jadwal praktek dan booking klinik Anda.</p>

        <form onSubmit={onSubmit} className="mt-10" noValidate>
          <label htmlFor="email" className="login__label">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            readOnly={loading}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className={FIELD}
          />

          <label htmlFor="password" className="login__label mt-5">
            Kata sandi
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            ref={passwordRef}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            readOnly={loading}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className={FIELD}
          />

          {/* Wadah error selalu ada (tinggi dipesan, role="alert"); isinya memudar masuk. */}
          <p
            id="login-error"
            role="alert"
            className="mt-3 min-h-[1.4em] text-center text-[14px] font-semibold"
          >
            {error && (
              <span key={error} className="form-error block">
                {error}
              </span>
            )}
          </p>

          <button
            type="submit"
            disabled={loading || !email || !password}
            aria-busy={loading}
            className="btn login__submit mt-4 w-full"
          >
            {loading && <span className="btn__spinner" aria-hidden="true" />}
            <span key={loading ? "loading" : "idle"} className="btn__label">
              {loading ? "Memproses…" : "Masuk"}
            </span>
          </button>
        </form>
        </div>
      </section>
    </main>
  );
}
