// Bingkai aplikasi untuk halaman staf klinik: top bar (logo, nama klinik, menu,
// nama pengguna) di atas bingkai batu, isi halaman di satu lembar putih.
// Dipakai bersama oleh /bookings dan /blocked-times (dipindah dari halaman
// booking di Task 10; gayanya ada di globals.css, kelas bk__*).
//
// Komponen ini tidak punya state dan tidak mengambil data: ia hanya membungkus
// `children` (apa pun yang ditulis di antara <Shell> dan </Shell>). Karena
// itu tidak perlu "use client"; ia ikut berjalan di browser saat dipakai oleh
// halaman yang sudah "use client".
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/Logo";

// Halaman yang bisa ditandai aktif di menu.
export type ShellPage = "bookings" | "blocked" | "akun";

// Daftar menu: satu tempat untuk urutan, alamat, dan tulisan. Menambah halaman
// baru (Pengaturan, dll.) cukup menambah satu baris di sini.
const NAV: { page: ShellPage; href: string; label: string }[] = [
  { page: "bookings", href: "/bookings", label: "Booking" },
  { page: "blocked", href: "/blocked-times", label: "Blokir" },
  { page: "akun", href: "/akun", label: "Akun" },
];

// `active` menandai menu halaman saat ini. Tanda `?` pada clinicName dan
// userName berarti boleh tidak diisi (saat halaman masih memuat).
// aria-current="page" memberi tahu pembaca layar bahwa tautan ini halaman saat
// ini, dan CSS memakai atribut yang sama untuk menggambar sorotannya.
export function Shell({
  active,
  clinicName,
  userName,
  children,
}: {
  active: ShellPage;
  clinicName?: string;
  userName?: string;
  children: ReactNode;
}) {
  return (
    <div className="bk">
      <header className="bk__top">
        <Link href="/" aria-label="Praktika, ke beranda" className="bk__brand">
          <LogoMark size={26} />
        </Link>
        <span className="bk__scope">{clinicName ?? "Praktika"}</span>
        <nav className="bk__nav" aria-label="Utama">
          {NAV.map((n) => (
            <Link
              key={n.page}
              href={n.href}
              aria-current={n.page === active ? "page" : undefined}
              className="bk__navlink"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        {userName && <span className="bk__user">{userName}</span>}
      </header>
      <main className="bk__sheet">
        <div className="bk__inner">{children}</div>
      </main>
    </div>
  );
}
