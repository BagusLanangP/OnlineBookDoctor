# Praktika: homepage (Next.js)

Homepage untuk Praktika, aplikasi jadwal praktek dan booking klinik. Dibuat dengan
Next.js 16 (App Router), React 19, TypeScript, dan Tailwind 4. Folder ini berdiri
sendiri; login dan dashboard masih berjalan di aplikasi Laravel di folder induk.

## Menjalankan

```bash
cd frontend
cp .env.example .env.local     # alamat aplikasi Laravel
npm install
npm run dev                    # http://localhost:3000
```

Untuk memeriksa hasil build produksi:

```bash
npm run build && npm run start
```

Tombol "Masuk" mengarah ke `NEXT_PUBLIC_APP_URL` + `/login`
(bawaan: `http://localhost:8088`, yaitu aplikasi Laravel di Docker).

## Struktur

| Berkas | Fungsi |
|---|---|
| `app/page.tsx` | Isi halaman dan semua teks (menu fitur, tanya jawab) |
| `app/globals.css` | Token warna dan huruf, serta seluruh gaya halaman |
| `app/icon.svg`, `components/Logo.tsx` | Logo Praktika (huruf P dengan tanda plus) |
| `components/Board.tsx` | Papan jadwal praktek yang bisa diklik (objek tetap di kiri) |
| `components/Step.tsx`, `StageContext.tsx` | Langkah cerita yang mengganti keadaan papan |
| `components/ui.tsx` | Potongan antarmuka Dashboard dan editor jadwal (contoh) |
| `components/Showcase.tsx` | Dashboard dengan tiga tab |
| `lib/config.ts` | Alamat aplikasi Laravel |

## Yang perlu diketahui

- Nama dokter, pasien, dan jam di papan serta potongan antarmuka hanya **contoh fiktif**.
- Potongan antarmuka meniru Dashboard dan editor jadwal aplikasi Laravel, dengan label
  Bahasa Indonesia dan warna biru Praktika (aplikasi aslinya masih berbahasa Inggris dan beraksen indigo).
- `next.config.ts` mengunci `turbopack.root` ke folder ini. Tanpa itu, Next.js ikut membaca
  `postcss.config.js` (Tailwind 3) milik Laravel di folder induk dan build gagal.
- Kata "praktika" dan seluruh tampilan memakai font Clash Grotesk dari Fontshare (butuh koneksi internet).
- Pendaftaran klinik mandiri belum ada di aplikasi Laravel (akun baru belum otomatis punya klinik),
  jadi halaman ini hanya menawarkan "Masuk", bukan "Daftar".
