"use client";

// Halaman masuk (Task 9a). Alur Sanctum SPA: minta cookie CSRF, kirim email dan
// kata sandi ke /api/login (balasan 204), lalu pindah ke /akun. Tidak ada token
// yang disimpan di browser; sesinya adalah cookie milik Laravel.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LogoMark } from "@/components/Logo";
import { ApiError, api, ensureCsrfCookie } from "@/lib/api";

const FIELD =
  "mt-2 block w-full min-h-[52px] border-2 border-[var(--ink)] bg-white px-4 text-[var(--ink)] disabled:opacity-60";

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
      router.push("/akun");
    } catch (err) {
      setError(messageFrom(err));
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-[var(--margin)] py-16">
      <div className="w-full max-w-md bg-[var(--paper)] p-8 sm:p-10">
        <Link href="/" aria-label="Praktika, ke beranda" className="inline-block">
          <LogoMark size={40} />
        </Link>

        <h1 className="mt-8 text-[length:var(--step-lead)] font-semibold">
          Masuk ke Praktika
        </h1>
        <p className="mt-2 text-[length:var(--step-small)] text-[var(--muted)]">
          Gunakan akun klinik Anda.
        </p>

        <form onSubmit={onSubmit} className="mt-8" noValidate>
          <label htmlFor="email" className="block text-[length:var(--step-small)] font-semibold">
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
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className={FIELD}
          />

          <label
            htmlFor="password"
            className="mt-5 block text-[length:var(--step-small)] font-semibold"
          >
            Kata sandi
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className={FIELD}
          />

          <p
            id="login-error"
            role="alert"
            className="mt-5 min-h-[1.4em] text-[length:var(--step-small)] font-semibold text-[#b3261e]"
          >
            {error}
          </p>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="btn mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Memproses…" : "Masuk"}
          </button>
        </form>
      </div>
    </main>
  );
}
