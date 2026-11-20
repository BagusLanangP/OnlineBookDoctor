"use client";

// Kerangka halaman staf: tombol garis tiga + Sidebar + tirai, dan isi halaman
// (dibungkus Shell oleh tiap halaman) di sebelahnya. Dipasang oleh
// app/(staff)/layout.tsx.
//
// Satu tombol, dua perilaku, mengikuti lebar layar (seperti sidebar di macOS/iPadOS):
//  - Desktop (>= 1024px): sidebar menempel di bingkai dan TAMPIL di awal. Tombol
//    menyembunyikan/menampilkannya; lembar putih melebar mengisi ruangnya.
//  - Tablet & ponsel (< 1024px): sidebar menjadi laci yang TERSEMBUNYI di awal.
//    Tombol membukanya di atas halaman; laci menutup saat menu dipilih, tirai
//    diklik, atau Esc ditekan.
//
// Kenapa state ada di sini, bukan di Shell? Tombol dan sidebar berbagi satu
// keadaan "terlihat atau tidak", sedangkan Shell dipakai per halaman dan tidak
// boleh tahu soal sidebar.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";

const DESKTOP = "(min-width: 1024px)"; // harus sama dengan @media di globals.css

// Membaca "apakah layar selebar desktop?" dan ikut berubah saat jendela diubah ukurannya.
// useSyncExternalStore: cara React membaca nilai dari luar React (di sini matchMedia).
// Server tidak punya layar, jadi di server dianggap desktop (getServerSnapshot = true);
// setelah halaman tampil di browser, React memakai nilai sebenarnya.
function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const isDesktopNow = () => window.matchMedia(DESKTOP).matches;
const isDesktopOnServer = () => true;

export function StaffFrame({ children }: { children: ReactNode }) {
  const isDesktop = useSyncExternalStore(subscribe, isDesktopNow, isDesktopOnServer);
  const [docked, setDocked] = useState(true); // desktop: sidebar ditampilkan
  const [drawer, setDrawer] = useState(false); // layar kecil: laci terbuka
  const visible = isDesktop ? docked : drawer;
  const drawerOpen = !isDesktop && drawer;

  const buttonRef = useRef<HTMLButtonElement>(null);
  const sideRef = useRef<HTMLElement>(null);

  // Laci terbuka di layar kecil: fokus pindah ke menu pertama (pengguna keyboard
  // langsung berada di dalam laci), dan Esc menutupnya lalu fokus kembali ke tombol.
  useEffect(() => {
    if (!drawerOpen) return;
    sideRef.current?.querySelector<HTMLElement>(".bk__navlink")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setDrawer(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function toggle() {
    if (isDesktop) setDocked((d) => !d);
    else setDrawer((o) => !o);
  }

  return (
    // data-side dibaca CSS desktop: "open" = sidebar menempel, "closed" = disembunyikan.
    <div className="bk-app" data-side={docked ? "open" : "closed"}>
      {/* Tombol garis tiga. aria-expanded memberi tahu pembaca layar apakah menu
          sedang terlihat; aria-controls menunjuk sidebar yang dikendalikan. Tombol
          berada di atas laci (z-index), jadi selalu bisa dipakai untuk menutup. */}
      <button
        ref={buttonRef}
        type="button"
        className="bk__menubtn"
        aria-label={visible ? "Sembunyikan menu" : "Tampilkan menu"}
        aria-expanded={visible}
        aria-controls="staff-sidebar"
        onClick={toggle}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <Sidebar
        ref={sideRef}
        visible={visible}
        drawerOpen={drawerOpen}
        onNavigate={() => setDrawer(false)}
      />
      {/* Tirai gelap di belakang laci (layar kecil saja); klik di luar laci menutupnya. */}
      {drawerOpen && <div className="bk__scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}

      <div className="bk-app__main">{children}</div>
    </div>
  );
}
