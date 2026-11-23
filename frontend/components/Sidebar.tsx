"use client";

// Sidebar menu halaman staf klinik. Berdiri sendiri: BUKAN bagian dari Shell.
// Kapan ia terlihat diatur oleh components/StaffFrame.tsx (tombol garis tiga):
// di desktop ia menempel di bingkai, di layar kecil ia menjadi laci.
// Menu aktif ditentukan dari alamat saat ini (usePathname), jadi halaman tidak
// perlu memberi tahu apa pun.
//
// Menambah fitur baru (Pengaturan, Jadwal, dll.) cukup menambah satu baris di NAV,
// dengan ikon garis 16px dari set yang sama. Gaya di globals.css (kelas bk__side*).
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode, Ref } from "react";
import { LogoMark } from "@/components/Logo";

// Ikon garis 16px, stroke 1.5, mewarisi warna teks (abu, atau tinta saat aktif).
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// `foot: true` = didorong ke bawah sidebar (utilitas seperti akun), seperti di macOS.
const NAV: { href: string; label: string; icon: ReactNode; foot?: boolean }[] = [
  {
    href: "/bookings",
    label: "Booking",
    icon: (
      <Icon>
        <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
        <path d="M2.5 6.75h11M5.5 2v3M10.5 2v3" />
      </Icon>
    ),
  },
  {
    href: "/schedules",
    label: "Jadwal",
    icon: (
      <Icon>
        <circle cx="8" cy="8" r="5.75" />
        <path d="M8 4.75V8l2.25 1.5" />
      </Icon>
    ),
  },
  {
    href: "/blocked-times",
    label: "Blokir waktu",
    icon: (
      <Icon>
        <circle cx="8" cy="8" r="5.75" />
        <path d="M3.95 12.05l8.1-8.1" />
      </Icon>
    ),
  },
  {
    href: "/akun",
    label: "Akun",
    foot: true,
    icon: (
      <Icon>
        <circle cx="8" cy="5.5" r="2.5" />
        <path d="M3 13.5c.8-2.4 2.8-3.5 5-3.5s4.2 1.1 5 3.5" />
      </Icon>
    ),
  },
];

// visible     : sidebar sedang terlihat (desktop: menempel; layar kecil: laci terbuka).
// drawerOpen  : laci terbuka di layar kecil (kelas is-open untuk gerakan laci).
// onNavigate  : dipanggil saat sebuah menu diklik (StaffFrame menutup laci).
export function Sidebar({
  ref,
  visible,
  drawerOpen,
  onNavigate,
}: {
  ref?: Ref<HTMLElement>;
  visible: boolean;
  drawerOpen: boolean;
  onNavigate: () => void;
}) {
  // Contoh: "/bookings" -> menu Booking aktif.
  const pathname = usePathname();
  return (
    // `inert` saat tidak terlihat: tautan di dalamnya tidak bisa difokus dengan Tab
    // dan tidak dibacakan pembaca layar, walau elemennya masih ada di halaman.
    <aside
      ref={ref}
      id="staff-sidebar"
      className={`bk__side${drawerOpen ? " is-open" : ""}`}
      inert={!visible}
    >
      {/* Isi selebar sidebar penuh, supaya label tidak terlipat saat sidebar
          menyempit dalam gerakan buka/tutup. */}
      <div className="bk__side-inner">
        <div className="bk__side-head">
          <Link href="/" className="bk__brand" onClick={onNavigate}>
            <LogoMark size={22} />
            <span>Praktika</span>
          </Link>
        </div>
        {/* aria-current="page" memberi tahu pembaca layar bahwa tautan ini halaman
            saat ini, dan CSS memakai atribut yang sama untuk menggambar sorotannya. */}
        <nav className="bk__sidenav" aria-label="Utama">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname === n.href ? "page" : undefined}
              className={`bk__navlink${n.foot ? " bk__navlink--foot" : ""}`}
              onClick={onNavigate}
            >
              {n.icon}
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
