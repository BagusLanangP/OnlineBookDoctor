// Pembungkus pemanggilan API untuk halaman booking (Task 9c).
//
// Peran file ini: "formulir pesanan" khusus booking. Halaman cukup menulis
// fetchBookings(filters), tanpa perlu tahu alamat, metode HTTP, atau bentuk body.
// Pengiriman sungguhan dikerjakan api() di lib/api.ts (cookie sesi, token CSRF,
// membaca balasan, melempar ApiError bila gagal).
//
// File ini TIDAK menampilkan apa pun ke layar dan TIDAK menyimpan data.
// Ia hanya menyiapkan permintaan lalu mengembalikan hasilnya ke pemanggil.

// `import { api }` = ambil fungsi bernama api dari file lib/api.ts.
// "@/" adalah singkatan untuk folder frontend/ (diatur di tsconfig.json),
// jadi "@/lib/api" berarti frontend/lib/api.ts.
import { api } from "@/lib/api";

// Mengambil beberapa hal sekaligus dari lib/booking.ts:
// - bookingsPath : fungsi biasa (dipakai saat program jalan).
// - kata `type`  : menandai bahwa yang diambil hanya TIPE, yaitu "bentuk data"
//                  untuk pengecekan editor dan `tsc`. Tipe lenyap saat program
//                  jalan, dan tidak memeriksa data dari server sungguhan.
import {
  bookingsPath,
  type Booking,
  type BookingFilters,
  type Paginated,
  type Practitioner,
} from "@/lib/booking";

// ---------------------------------------------------------------------------
// 1) Mengambil daftar booking (GET)
// ---------------------------------------------------------------------------
// Cara membaca baris pertama:
//   export function fetchBookings   -> fungsi bernama fetchBookings, boleh dipakai
//                                      file lain (export = "dibagikan keluar").
//   (f: BookingFilters)             -> menerima satu masukan bernama f, bentuknya
//                                      BookingFilters (tanggal, status, dokter, halaman).
//   : Promise<Paginated<Booking>>   -> hasilnya BELUM langsung ada. "Promise" itu
//                                      janji: jaringan butuh waktu, jadi hasilnya
//                                      datang nanti. Pemanggil memakai `await` untuk
//                                      menunggu. Isi janjinya: paginator Laravel
//                                      yang berisi daftar Booking.
export function fetchBookings(f: BookingFilters): Promise<Paginated<Booking>> {
  // api<...>(...) = panggil fungsi api() milik lib/api.ts.
  // Bagian <Paginated<Booking>> memberi tahu TypeScript "balasannya akan
  // berbentuk begini", supaya hasilnya punya saran kode di editor.
  // (Ini janji kita saja; TypeScript tidak memeriksa balasan asli.)
  // bookingsPath(f) membuat alamat dari filter, contoh
  // "/bookings?date=2026-11-18&status=confirmed". Tanpa awalan "/api",
  // karena api() menambahkannya sendiri. Metode tidak ditulis karena
  // bawaannya GET (mengambil data, tidak mengubah apa pun).
  return api<Paginated<Booking>>(bookingsPath(f));
}

// ---------------------------------------------------------------------------
// 2) Mengambil daftar dokter untuk dropdown (GET)
// ---------------------------------------------------------------------------
// Tidak ada masukan, jadi kurungnya kosong. Hasilnya janji berisi array dokter.
// Bentuk `Practitioner[]` artinya "daftar (array) berisi Practitioner".
// Berbeda dengan booking, balasannya array biasa tanpa paginasi.
export function fetchPractitioners(): Promise<Practitioner[]> {
  return api<Practitioner[]>("/practitioners");
}

// ---------------------------------------------------------------------------
// 3) Tombol "Selesai" (PUT)
// ---------------------------------------------------------------------------
// id: number -> nomor booking yang dituju, contoh 7.
// Backend menerima status "completed" atau "cancelled" di rute ini.
export function markCompleted(id: number): Promise<Booking> {
  // Tanda ` ` ` (backtick) membuat teks yang bisa disisipi nilai: ${id} diganti
  // nomornya, jadi id = 7 menghasilkan "/bookings/7".
  return api<Booking>(`/bookings/${id}`, {
    // PUT = "ubah data yang sudah ada" (bukan GET yang hanya mengambil).
    method: "PUT",
    // Isi paket yang dikirim ke Laravel. Browser hanya bisa mengirim TEKS,
    // jadi objek { status: "completed" } diubah dulu menjadi teks JSON:
    // '{"status":"completed"}'. Laravel membacanya kembali sebagai data.
    body: JSON.stringify({ status: "completed" }),
  });
}

// ---------------------------------------------------------------------------
// 4) Tombol "Batal" (DELETE)
// ---------------------------------------------------------------------------
// Walau namanya DELETE, di backend booking TIDAK dihapus: hanya status-nya
// diubah menjadi "cancelled" (lihat BookingService::cancel). Laravel membalas
// 204 (berhasil, tanpa isi), jadi tidak ada data untuk dikembalikan.
// Itu sebabnya tipenya Promise<void>: "janji yang selesai tanpa membawa data".
export function cancelBooking(id: number): Promise<void> {
  return api<void>(`/bookings/${id}`, { method: "DELETE" });
}
