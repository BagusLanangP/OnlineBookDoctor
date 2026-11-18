import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Plus Jakarta Sans: huruf sans yang ramah dan hangat, dirancang di Jakarta.
// Dimuat lewat next/font, jadi file font disimpan sendiri (tanpa permintaan ke pihak ketiga).
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Praktika: jadwal praktek dan booking klinik tanpa bentrok",
  description:
    "Praktika membantu klinik mengatur jam praktek dokter, menghitung slot kosong otomatis, dan menjaga satu slot tetap untuk satu pasien.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: skrip di <head> menambah kelas "js" ke <html> sebelum
    // React hydrate, jadi className dari server dan klien sengaja berbeda.
    <html lang="id" className={jakarta.variable} suppressHydrationWarning>
      <head>
        {/* Penanda "js aktif": animasi masuk hanya menyembunyikan konten
            kalau skrip benar-benar jalan, sehingga tanpa JS semuanya tetap terbaca. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body>
        {/* Satu perlakuan untuk semua foto: abu-abu, lalu dipetakan ke dua warna
            (biru tua Praktika untuk bagian gelap, warna kertas untuk bagian terang). */}
        <svg
          width="0"
          height="0"
          aria-hidden="true"
          focusable="false"
          style={{ position: "absolute" }}
        >
          <filter id="duo" colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues="0.09 0.937" />
              <feFuncG type="table" tableValues="0.22 0.933" />
              <feFuncB type="table" tableValues="0.604 0.922" />
            </feComponentTransfer>
          </filter>
        </svg>
        {children}
      </body>
    </html>
  );
}
