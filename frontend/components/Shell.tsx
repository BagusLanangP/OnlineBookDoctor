// Bingkai isi halaman staf klinik: top bar (nama klinik dan nama pengguna) di
// atas bingkai batu, dan isi halaman di satu lembar putih. Dipakai bersama oleh
// /bookings dan /blocked-times (dipindah dari halaman booking di Task 10; gayanya
// ada di globals.css, kelas bk__*).
//
// Menu TIDAK ada di sini: sidebar adalah komponen sendiri (components/Sidebar.tsx)
// yang dipasang oleh app/(staff)/layout.tsx di samping Shell.
//
// Komponen ini tidak punya state dan tidak mengambil data: ia hanya membungkus
// `children` (apa pun yang ditulis di antara <Shell> dan </Shell>). Karena itu
// tidak perlu "use client"; ia ikut berjalan di browser saat dipakai oleh halaman
// yang sudah "use client". Tanda `?` pada clinicName dan userName berarti boleh
// tidak diisi (saat halaman masih memuat).
import type { ReactNode } from "react";

export function Shell({
  clinicName,
  userName,
  children,
}: {
  clinicName?: string;
  userName?: string;
  children: ReactNode;
}) {
  return (
    <div className="bk">
      <header className="bk__top">
        <span className="bk__scope">{clinicName ?? "Praktika"}</span>
        {userName && <span className="bk__user">{userName}</span>}
      </header>
      <main className="bk__sheet">
        <div className="bk__inner">{children}</div>
      </main>
    </div>
  );
}
