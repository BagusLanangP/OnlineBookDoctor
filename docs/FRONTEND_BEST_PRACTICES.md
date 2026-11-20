# Best Practices: Mengedit Frontend (Next.js)

Pegangan untuk mengubah `frontend/` tanpa merusak tampilan, perilaku, atau gaya yang sudah dibangun.
Gaya halaman staf adalah **"framed sheet"** (minimalis, ala aplikasi Apple): bingkai batu berbentuk L
(sidebar + top bar), isi halaman di satu lembar putih, warna hanya pada data.

---

## 1. Peta berkas

```
frontend/
├─ app/
│  ├─ layout.tsx              root layout (font, globals.css)
│  ├─ page.tsx, login/, akun/ halaman publik / akun (gaya sendiri)
│  ├─ (staff)/                grup rute halaman staf; "(staff)" TIDAK muncul di URL
│  │  ├─ layout.tsx           memasang StaffFrame sekali untuk semua halaman staf
│  │  ├─ bookings/page.tsx    /bookings
│  │  └─ blocked-times/page.tsx /blocked-times
│  └─ globals.css             SEMUA gaya; kelas halaman staf berawalan bk__
├─ components/
│  ├─ StaffFrame.tsx          tombol garis tiga + state buka/tutup sidebar
│  ├─ Sidebar.tsx             menu (berdiri sendiri, bukan bagian Shell)
│  └─ Shell.tsx               top bar (klinik, pengguna) + lembar putih
└─ lib/
   ├─ api.ts                  satu-satunya pintu ke Laravel (cookie, CSRF, ApiError)
   ├─ *-api.ts                pembungkus endpoint per fitur (tanpa logika)
   ├─ booking.ts, blocked.ts  tipe + fungsi MURNI (tanpa import runtime), dites
   ├─ *.test.ts               node:test
   └─ me.ts                   tipe Clinic / Me bersama
```

**Halaman staf baru** (Pengaturan, Jadwal, dll.):
1. Buat `app/(staff)/<nama>/page.tsx`, bungkus isinya dengan `<Shell clinicName userName>`.
2. Tambah satu baris di `NAV` pada `components/Sidebar.tsx` (ikon garis 16px, stroke 1.5).
3. Tidak perlu menyentuh StaffFrame, layout, atau CSS shell.

## 2. Aturan Next.js di proyek ini

- Next.js 16 berbeda dari versi lama. **Baca panduan di `frontend/node_modules/next/dist/docs/`**
  sebelum menulis kode Next (aturan `frontend/AGENTS.md`).
- Halaman yang memakai state/efek diawali `"use client"`. Komponen tanpa state (Shell) tidak perlu.
- Layout tetap komponen server; interaksi dipindah ke komponen klien kecil (contoh: StaffFrame).
- Jangan pakai `new Date("2026-11-20T17:00")` untuk waktu klinik (dibaca zona browser).
  Semua waktu ke API dalam **UTC** lewat `clinicLocalToUtc`; tampilan memakai `clinic.timezone`.

## 3. Shell dan navigasi (sidebar dinamis)

| Lebar | Sidebar | Tombol garis tiga |
|---|---|---|
| ≥ 1024px (desktop) | Menempel di bingkai, **tampil** di awal | Sembunyikan / tampilkan; lembar melebar |
| < 1024px (tablet, ponsel) | Laci di atas halaman, **tersembunyi** di awal | Buka / tutup laci |

- Satu state per perilaku di `StaffFrame` (`docked` untuk desktop, `drawer` untuk layar kecil);
  lebar layar dibaca dengan `useSyncExternalStore` + `matchMedia`. Breakpoint **1024px harus sama**
  di `StaffFrame.tsx` (`DESKTOP`) dan `globals.css`.
- Laci menutup saat: menu diklik, tirai diklik, **Esc** (fokus kembali ke tombol).
- Sidebar yang tak terlihat diberi `inert` (tidak bisa di-Tab, tidak dibacakan).
- Tombol: `aria-expanded`, `aria-controls="staff-sidebar"`, label berubah ("Tampilkan/Sembunyikan menu").
- Menu aktif dari `usePathname()` + `aria-current="page"`; CSS menyorot lewat atribut yang sama.
- Sidebar **tidak boleh** dimasukkan ke Shell, dan Shell tidak boleh tahu soal sidebar.

## 4. Gaya visual (minimalis, ala Apple)

**Warna.** Satu bingkai batu (`--frame`), lembar putih (`--sheet`), tinta (`--ink`), satu aksen biru
(`--accent`) hanya untuk data dan status penting (garis tab aktif, "Berikutnya"). Tombol utama
berwarna tinta gelap, bukan aksen. Pakai token yang ada; jangan menulis warna baru acak.

**Permukaan.** Dipisah satu langkah warna atau garis 1px (`--edge`, `--rule`), **bukan bayangan**.
Bayangan hanya untuk yang mengambang (laci, menu, dialog). Radius: lembar 16px, panel 12px, kontrol 8px.

**Huruf.** Satu keluarga: Plus Jakarta Sans. Ukuran utama 12 / 14 / 16 / 24px (judul halaman
24px/600), ditambah 13px untuk baris kedua (telepon) dan 15px untuk nama produk. Jangan menambah ukuran baru. Angka di tabel dan jam memakai `font-variant-numeric: tabular-nums`.
Sentence case; tidak ada label kecil huruf besar berspasi.

**Navigasi.** Baris menu 34px (44px di layar sentuh), ikon garis 16px abu, label 14px.
Aktif = pil abu netral (`rgb(38 37 30 / .08)`) dengan label tinta, **bukan** warna aksen atau garis kiri.

**Dilarang** (dicek oleh taste-skill): gradien, glow/kaca/blur, ikon di kotak berwarna, emoji,
warna violet/indigo, latar krem kekuningan, label "eyebrow" di atas judul, bayangan pada kartu diam.

## 5. Tata letak halaman

- Satu `h1` per halaman (24px), kalimat pendek di bawahnya tentang datanya, aksi di kanan judul.
- Daftar pendek (≤ 6 baris) **tidak merentang selebar kanvas**: pasangkan dengan blok lain
  (contoh: Blokir waktu = panel form 340px + daftar, berdampingan di ≥ 1180px).
- Form memakai **grid tetap**, bukan `auto-fit` (yang membuat kolom terjepit dan baris yatim).
  Label selalu terlihat di atas kolom; placeholder bukan pengganti label.
- Ponsel (≤ 640px): bingkai hilang, lembar = layar, tabel menjadi baris dua tingkat, tanpa scroll
  horizontal. Target sentuh minimal 44px.

## 6. Keadaan data (wajib di setiap blok)

Memuat (kerangka setinggi aslinya, tanpa kilau) · kosong (bingkai tetap + satu kalimat) ·
error di dalam blok + "Coba lagi" · 401 → `/login` · 403 / tanpa klinik → pesan jelas.
Respons lama tidak boleh menimpa yang baru (pola `alive`/kunci permintaan), klik ganda ditahan
`useRef`. Angka nol ditulis "0", nilai tak ada ditulis "–".

## 7. Aksesibilitas

Setiap kontrol bisa dipakai dengan keyboard, punya nama (label terlihat atau `aria-label` untuk ikon),
fokus terlihat (outline global 3px aksen). Pesan error memakai `role="alert"` pada elemen yang
**selalu ada** (disembunyikan dengan `hidden`) supaya langsung dibacakan.
Gerak hanya sebagai umpan balik (buka/tutup, tekan) dan dimatikan oleh `prefers-reduced-motion`.

## 8. Alur kerja sebelum commit

```bash
cd frontend
npm test            # node:test untuk lib/*.test.ts
npm run lint
npx tsc --noEmit
npm run build       # wajib lolos; halaman kosong (0 byte) membuat build gagal
```

**Cek tampilan tanpa login** (halaman staf butuh sesi): jalankan API tiruan yang menjawab
`/api/user`, `/api/practitioners`, `/api/bookings`, `/api/practitioners/{id}/blocked-times`
(dengan CORS `credentials`), build dengan `NEXT_PUBLIC_API_URL=<api tiruan> npx next build`,
`npx next start -p <port>`, lalu periksa di 1440, 768, dan 390px:

```bash
node <taste-skill>/scripts/lint.mjs --app frontend/components "frontend/app/(staff)"
node <taste-skill>/scripts/inspect.mjs --app http://localhost:<port>/bookings
```

Target: **0 FAIL**; setiap WARN diperbaiki atau punya alasan satu kalimat. Lihat screenshot-nya,
jangan hanya angkanya. Setelah selesai, build ulang **tanpa** `NEXT_PUBLIC_API_URL` tiruan.

**Git.** Jangan ikut commit `package-lock.json` di root, folder `.taste-skill/`, `.claude/`,
atau perubahan mode berkas `.gitignore`. Satu commit = satu perubahan yang bisa dijelaskan.
