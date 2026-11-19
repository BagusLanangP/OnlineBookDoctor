"use client";

// Halaman akun (Task 9a). Menampilkan pengguna yang sedang masuk dan kliniknya
// (dibaca dari API Laravel dengan cookie sesi), dengan tombol ke halaman
// booking dan tombol keluar.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { ApiError, api } from "@/lib/api";

type Me = {
  user: { id: number; name: string; email: string };
  clinic: { id: number; name: string; timezone: string } | null;
};

export default function AkunPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api<Me>("/user")
      .then((data) => alive && setMe(data))
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        } else {
          setLoadError("Tidak bisa memuat data akun. Pastikan Laravel berjalan, lalu muat ulang.");
        }
      });
    return () => {
      alive = false;
    };
  }, [router]);

  async function logout() {
    setLeaving(true);
    try {
      await api("/logout", { method: "POST" });
    } catch {
      // Sesi sudah berakhir atau server tidak terjangkau; tetap kembali ke login.
    }
    router.replace("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-[var(--margin)] py-16">
      <div className="w-full max-w-md bg-[var(--paper)] p-8 sm:p-10">
        <Link href="/" aria-label="Praktika, ke beranda" className="inline-block">
          <LogoMark size={40} />
        </Link>

        {loadError ? (
          <p role="alert" className="mt-8 font-semibold text-[#b3261e]">
            {loadError}
          </p>
        ) : !me ? (
          <p className="mt-8 text-[var(--muted)]" aria-live="polite">
            Memuat…
          </p>
        ) : (
          <>
            <h1 className="mt-8 text-[length:var(--step-lead)] font-semibold">
              Halo, {me.user.name}
            </h1>
            <p className="mt-1 text-[length:var(--step-small)] text-[var(--muted)]">
              {me.user.email}
            </p>

            <p className="mt-6">
              {me.clinic ? (
                <>
                  <span className="block text-[length:var(--step-small)] text-[var(--muted)]">
                    Klinik
                  </span>
                  <span className="font-semibold">{me.clinic.name}</span>
                  <span className="block text-[length:var(--step-small)] text-[var(--muted)]">
                    Zona waktu {me.clinic.timezone}
                  </span>
                </>
              ) : (
                <span className="font-semibold">Akun ini belum terhubung ke klinik.</span>
              )}
            </p>

            <div className="mt-8 flex flex-col gap-3">
              {me.clinic && (
                <Link href="/bookings" className="btn btn--tone w-full">
                  Lihat booking
                </Link>
              )}
              <button
                type="button"
                onClick={logout}
                disabled={leaving}
                className="btn btn--ink w-full disabled:opacity-60"
              >
                {leaving ? "Keluar…" : "Keluar"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
