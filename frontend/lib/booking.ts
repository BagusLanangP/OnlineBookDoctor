export type BookingStatus = "completed" | "confirmed" | "cancelled";

export type Booking = {
    id : number;
    practitioner_id : number;
    patient_name : string;
    patient_phone : string;
    visit_reason: string;
    // Waktu booking dari Laravel berbentuk teks ISO 8601 dalam UTC,
    // contoh "2026-11-17T17:00:00.000000Z" (huruf Z = UTC).
    booked_time: string;
    status: BookingStatus;
    // Nama field ini HARUS "practitioner": itu nama relasi di model Booking
    // Laravel (belongsTo), dan itulah kunci yang dikirim di JSON. Kalau ditulis
    // practitioner_name, TypeScript tidak akan protes tetapi isinya undefined
    // saat dipakai di halaman.
    practitioner: { id: number; name: string };
};

export type Practitioner = { id: number; name: string; specialty: string };

// Bentuk paginator Laravel; hanya field yang dipakai halaman.
export type Paginated<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
};

// Pilihan filter yang sedang aktif di halaman. Ini state di sisi Next.js,
// bukan bentuk data dari Laravel.
export type BookingFilters = {
    date: string; // "2026-11-18"
    status: "" | BookingStatus; // "" artinya semua status
    practitionerId: string; // "" artinya semua dokter (string karena nilai <select>)
    page: number;
};

// Kamus penerjemah: nilai status di database memakai bahasa Inggris
// ("confirmed"), tetapi staf klinik harus membaca bahasa Indonesia.
// Dipakai di tabel dan dropdown: STATUS_LABEL["confirmed"] -> "Terkonfirmasi".
// Record<BookingStatus, string> membuat TypeScript memaksa ketiga status terisi;
// kalau nanti ada status baru, lupa menerjemahkannya akan jadi error saat build.
export const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Terkonfirmasi",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

// Menjawab "hari ini tanggal berapa di klinik?" dalam bentuk "YYYY-MM-DD".
// Kenapa tidak memakai new Date() saja? Karena itu mengikuti jam komputer staf.
// Kalau komputernya berada di zona lain, tanggalnya bisa beda dengan tanggal
// klinik (jam 00.30 di Jakarta masih tanggal kemarin di UTC).
// - tz  : zona waktu klinik, contoh "Asia/Jakarta" (dari /api/user).
// - now : waktu yang dipakai. Defaultnya sekarang; parameter ini ada supaya
//         fungsi bisa dites dengan waktu tetap.
// Locale "en-CA" (Kanada) dipilih hanya karena format tanggalnya sudah
// YYYY-MM-DD, persis format yang diminta backend (date_format:Y-m-d).
export function todayIn(tz: string, now: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
}

// Menggeser tanggal maju/mundur: shiftDate("2026-11-30", 1) -> "2026-12-01".
// Dipakai tombol ◀ dan ▶ di halaman (days = -1 atau +1).
// Langkahnya: pecah teks jadi [tahun, bulan, hari]; buat tanggal lewat
// Date.UTC (bulan di JavaScript dimulai dari 0, makanya m - 1) dengan hari
// ditambah `days`; Date otomatis mengurus pergantian bulan, tahun, dan tahun
// kabisat. toISOString().slice(0, 10) mengambil "YYYY-MM-DD" lagi.
// Memakai UTC (bukan zona lokal) supaya hasilnya tidak ikut bergeser karena
// zona waktu atau jam musim panas.
export function shiftDate(date: string, days: number): string {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}


// Mengubah waktu UTC dari Laravel menjadi jam yang dibaca staf klinik:
// formatDate("2026-11-17T17:00:00Z", "Asia/Jakarta") -> "00.00".
// (Catatan nama: fungsi ini mengembalikan JAM, bukan tanggal. Di rencana dan
// tesnya namanya formatTime.)
export function formatDate(iso: string, tz: string): string {
    const date = new Date(iso);
    // Penjaga data rusak. Kalau `iso` bukan tanggal yang valid, new Date()
    // tidak error melainkan menghasilkan "Invalid Date", yang waktunya bernilai
    // NaN (Not a Number). Number.isNaN(...) mendeteksinya, lalu kita kembalikan
    // "-". Tanpa ini, Intl.DateTimeFormat akan melempar RangeError dan satu
    // baris booking yang rusak membuat seluruh tabel gagal tampil.
    if (Number.isNaN(date.getTime())) return "-";
    // Pemformat jam: timeZone menentukan zona yang dipakai (zona klinik),
    // hour/minute "2-digit" memaksa dua angka ("00", bukan "0"), dan locale
    // "id-ID" memakai titik sebagai pemisah ("00.00", bukan "00:00").
    return new Intl.DateTimeFormat("id-ID", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

// Menyusun alamat API dari filter yang aktif, contoh:
// "/bookings?date=2026-11-18&status=confirmed&practitioner_id=3&page=2".
// Tanpa "/api" di depan karena fungsi api() di lib/api.ts menambahkannya sendiri.
export function bookingsPath(f: BookingFilters): string {
    // URLSearchParams adalah alat bawaan untuk menulis bagian "?a=1&b=2".
    // Ia otomatis mengamankan karakter khusus (spasi, &, dan lain-lain), jadi
    // lebih aman daripada menyambung teks dengan `+` secara manual.
    // Tanggal selalu ikut, makanya langsung dimasukkan sejak awal.
    const params = new URLSearchParams({ date: f.date });
    // Tiga baris di bawah menambah parameter HANYA bila ada isinya:
    // - status "" (Semua)         -> dilewati, backend tidak menyaring status.
    // - practitionerId "" (Semua) -> dilewati.
    // - page 1                    -> dilewati karena itu halaman bawaan.
    // Jadi alamatnya tetap pendek dan bersih. Perhatikan nama parameter ke
    // backend memakai underscore (practitioner_id), sedangkan di sisi kita
    // practitionerId; keduanya sengaja berbeda.
    if (f.status) params.set("status", f.status);
    if (f.practitionerId) params.set("practitioner_id", f.practitionerId);
    if (f.page > 1) params.set("page", String(f.page));
    return `/bookings?${params}`;
}