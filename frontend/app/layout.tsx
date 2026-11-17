import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Praktika: jadwal praktek dan booking klinik tanpa bentrok",
  description:
    "Praktika membantu klinik mengatur jam praktek dokter, menghitung slot kosong otomatis, dan menjaga satu slot tetap untuk satu pasien.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id">
      <head>
        {/* Clash Grotesk dari Fontshare (font yang dipilih lembar arah). */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          rel="preconnect"
          href="https://cdn.fontshare.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=clash-grotesk@400,500&display=swap"
        />
        {/* Penanda "js aktif": animasi masuk hanya menyembunyikan konten
            kalau skrip benar-benar jalan, sehingga tanpa JS semuanya tetap terbaca. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
