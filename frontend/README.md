# Praktika: homepage (Next.js)

Homepage untuk Praktika, aplikasi jadwal praktek dan booking klinik. Dibuat dengan
Next.js 16 (App Router), React 19, TypeScript, dan Tailwind 4. Folder ini berdiri
sendiri dan mengambil data dari API Laravel di folder induk.

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

Tombol "Masuk" mengarah ke halaman `/login` milik Next.js. Login, data akun, dan
booking diambil dari API Laravel di `NEXT_PUBLIC_API_URL`
(bawaan: `http://localhost:8088`, yaitu aplikasi Laravel di Docker).
Setelah masuk, pengguna diarahkan ke `/bookings`.

## Struktur

| Berkas | Fungsi |
|---|---|
| `app/page.tsx` | Isi halaman dan semua teks (menu fitur, tanya jawab) |
| `app/globals.css` | Token warna dan huruf, serta seluruh gaya halaman |
| `app/icon.svg`, `components/Logo.tsx` | Logo Praktika (huruf P dengan tanda plus) |
| `components/Board.tsx` | Papan jadwal praktek yang bisa diklik (objek tetap di kiri) |
| `components/Step.tsx`, `StageContext.tsx` | Langkah cerita yang mengganti keadaan papan |
| `components/ui.tsx` | Potongan antarmuka Dashboard dan editor jadwal (contoh) |
| `components/Showcase.tsx` | Dashboard dengan tiga tab di atas foto |
| `components/Photo.tsx` | Foto dengan perlakuan duotone seragam |
| `lib/config.ts` | Alamat halaman login (`/login`) |
| `app/login/page.tsx`, `app/akun/page.tsx` | Login dan halaman akun (keluar) |
| `app/bookings/page.tsx` | Daftar booking per hari, filter dokter dan status, tombol Selesai/Batal |
| `lib/api.ts` | Pengirim permintaan ke API Laravel (cookie sesi, token CSRF) |
| `lib/booking.ts`, `lib/booking-api.ts` | Tipe dan fungsi bantu booking, serta pemanggil API booking |
| `lib/booking.test.ts` | Tes fungsi bantu booking (`npm test`) |

## Yang perlu diketahui

- Nama dokter, pasien, dan jam di papan serta potongan antarmuka hanya **contoh fiktif**.
- Potongan antarmuka meniru Dashboard dan editor jadwal aplikasi Laravel, dengan label
  Bahasa Indonesia dan warna biru Praktika (aplikasi aslinya masih berbahasa Inggris dan beraksen indigo).
- `next.config.ts` mengunci `turbopack.root` ke folder ini. Tanpa itu, Next.js ikut membaca
  `postcss.config.js` (Tailwind 3) milik Laravel di folder induk dan build gagal.
- Font: Plus Jakarta Sans, dimuat lewat `next/font/google` (file font disimpan sendiri saat build).
- Foto (5 buah di `public/img`) berasal dari Unsplash dan hanya suasana, bukan foto klinik tertentu.
  Semuanya memakai satu perlakuan duotone biru (filter `#duo` di `app/layout.tsx`, kelas `.photo` di
  `app/globals.css`). Kreditnya ada di kaki halaman; ganti foto dengan foto klinik asli kalau sudah ada.
- Pendaftaran klinik mandiri belum ada di aplikasi Laravel (akun baru belum otomatis punya klinik),
  jadi halaman ini hanya menawarkan "Masuk", bukan "Daftar".
