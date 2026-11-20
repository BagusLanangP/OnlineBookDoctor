// Tipe dan fungsi murni untuk halaman Blocked Times (Task 10).
//
// File ini TIDAK memanggil jaringan dan TIDAK menampilkan apa pun. Tanpa import
// runtime, supaya bisa diuji dengan `node --test` (lihat blocked.test.ts).

// Satu blokir seperti yang dikirim Laravel (GET daftar dan POST buat).
// Waktu selalu ISO 8601 dalam UTC. Daftar blokir TIDAK memuat relasi dokter.
export type BlockedTime = {
  id: number;
  practitioner_id: number;
  start_time: string; // contoh "2026-11-17T17:00:00.000000Z"
  end_time: string; // contoh "2026-11-17T19:00:00.000000Z"
  reason: string;
};

// Pasien yang sudah booking di rentang blokir (untuk tombol WhatsApp).
export type Conflict = {
  id: number;
  patient_name: string;
  patient_phone: string;
  booked_time: string;
};

// Balasan POST: data blokirnya DITAMBAH info bentrok.
// conflicting_bookings = jumlah penuh; conflicts = daftar, maksimal 50.
export type CreateBlockedResponse = BlockedTime & {
  conflicting_bookings: number;
  conflicts: Conflict[];
};

// Isi form di layar (state Next.js, bukan bentuk data dari Laravel).
// Tanggal "2026-11-20", jam "17:00", keduanya menurut zona waktu klinik.
export type BlockedForm = {
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  reason: string;
};

// Isi POST ke Laravel: waktu sudah berbentuk ISO UTC (hasil buildBlockRange),
// bukan jam klinik.
export type NewBlock = {
  start_time: string; // contoh "2026-11-17T17:00:00.000Z"
  end_time: string;
  reason: string;
};

// Selisih zona waktu `tz` terhadap UTC pada instan `ms` (milidetik), contoh
// Asia/Jakarta -> +7 jam. Intl hanya bisa menjawab "jam berapa di zona X pada
// instan Y", jadi kita ambil jam dindingnya, anggap itu UTC, lalu kurangkan
// instan aslinya. Pembulatan ke detik membuang milidetik supaya selisihnya bulat.
function offsetMs(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23", // jam 00-23 (tanpa "24:00" di tengah malam)
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const p: Record<string, string> = {};
  for (const x of parts) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// Waktu dinding klinik -> ISO UTC:
// clinicLocalToUtc("2026-11-20", "17:00", "Asia/Jakarta") -> "2026-11-20T10:00:00.000Z".
// Jangan diganti new Date("2026-11-20T17:00"): itu dibaca memakai zona BROWSER.
// Caranya: tebak instannya (jam dinding dianggap UTC), hitung selisih zona di titik
// itu, koreksi. Dua putaran cukup, termasuk di batas pergantian jam musim panas.
export function clinicLocalToUtc(date: string, time: string, tz: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wanted = Date.UTC(y, mo - 1, d, h, mi); // jam dinding, pura-pura UTC
  let guess = wanted;
  for (let i = 0; i < 2; i++) guess = wanted - offsetMs(guess, tz);
  return new Date(guess).toISOString();
}

// Alamat daftar blokir mendatang satu dokter, tanpa "/api" (ditambah oleh api()).
// Contoh: blockedPath(1, 2) -> "/practitioners/1/blocked-times?upcoming=1&page=2".
// upcoming=1 selalu ikut (hanya blokir yang belum lewat); page dilewati bila 1
// (halaman bawaan), seperti bookingsPath.
export function blockedPath(practitionerId: number, page = 1): string {
  const params = new URLSearchParams({ upcoming: "1" });
  if (page > 1) params.set("page", String(page));
  return `/practitioners/${practitionerId}/blocked-times?${params}`;
}

// ---------------------------------------------------------------------------
// Dari isi form menjadi isi POST
// ---------------------------------------------------------------------------

// Hasil buildBlockRange: berhasil membawa isi POST, gagal membawa pesan untuk
// ditampilkan di bawah form. `ok` membedakan keduanya (TypeScript memaksa kita
// memeriksa `ok` sebelum membaca `value` atau `error`).
export type BlockRangeResult =
  | { ok: true; value: NewBlock }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// "2026-02-30" lolos regex tetapi bukan tanggal nyata. Date.UTC menggulirkannya
// ke 2 Maret, jadi kita bandingkan hasilnya dengan masukan: beda berarti palsu.
function isRealDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === date;
}

function isRealTime(time: string): boolean {
  if (!TIME_RE.test(time)) return false;
  const [h, m] = time.split(":").map(Number);
  return h <= 23 && m <= 59;
}

// Tanggal berikutnya: "2026-11-30" -> "2026-12-01" (Date mengurus pergantian
// bulan/tahun). Sengaja ditulis lagi di sini, bukan mengimpor shiftDate dari
// booking.ts, supaya file ini tetap tanpa import (aman untuk node --test dan Next).
function dayAfter(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// Memeriksa form lalu mengubahnya menjadi { start_time, end_time, reason } (UTC).
// Urutan pemeriksaan mengikuti urutan form (tanggal, jam, alasan) supaya pesan
// yang muncul adalah masalah pertama yang dilihat pengguna.
// - "Seharian": 00.00 tanggal mulai sampai 00.00 HARI SETELAH tanggal selesai
//   (akhir eksklusif, cocok dengan aturan bentrok [start, end) di backend).
// - Jam biasa: tanggal+jam mulai sampai tanggal+jam selesai, boleh lintas hari.
export function buildBlockRange(form: BlockedForm, tz: string): BlockRangeResult {
  const fail = (error: string): BlockRangeResult => ({ ok: false, error });

  if (!isRealDate(form.startDate) || !isRealDate(form.endDate)) {
    return fail("Tanggal mulai dan selesai wajib diisi.");
  }
  // Tanggal berbentuk YYYY-MM-DD, jadi urutan teks = urutan kalender.
  if (form.endDate < form.startDate) {
    return fail("Tanggal selesai tidak boleh sebelum tanggal mulai.");
  }
  if (!form.allDay && (!isRealTime(form.startTime) || !isRealTime(form.endTime))) {
    return fail("Jam mulai dan selesai wajib diisi.");
  }

  const reason = form.reason.trim();
  if (!reason) return fail("Alasan wajib diisi.");
  // [...reason] menghitung karakter, bukan unit UTF-16, seperti `max:255` Laravel.
  if ([...reason].length > 255) return fail("Alasan maksimal 255 karakter.");

  if (form.allDay) {
    return {
      ok: true,
      value: {
        start_time: clinicLocalToUtc(form.startDate, "00:00", tz),
        end_time: clinicLocalToUtc(dayAfter(form.endDate), "00:00", tz),
        reason,
      },
    };
  }

  const start = clinicLocalToUtc(form.startDate, form.startTime, tz);
  const end = clinicLocalToUtc(form.endDate, form.endTime, tz);
  if (Date.parse(end) <= Date.parse(start)) {
    return fail("Waktu selesai harus setelah waktu mulai.");
  }
  return { ok: true, value: { start_time: start, end_time: end, reason } };
}

// ---------------------------------------------------------------------------
// Dari data blokir menjadi teks di daftar
// ---------------------------------------------------------------------------

// Tiga pemformat zona klinik. en-CA dipilih karena hasilnya sudah YYYY-MM-DD
// (sama seperti todayIn di booking.ts); id-ID memberi "17.00" dan "Nov"/"Des".
function ymd(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}
function hm(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
}
function dayLabel(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: tz, day: "numeric", month: "short" }).format(d);
}

// Teks satu baris daftar, semuanya menurut zona klinik:
//   "20 Nov, 17.00-19.00"            sebagian hari
//   "20 Nov 17.00 - 21 Nov 09.00"    lintas hari
//   "20 Nov (seharian)"              satu hari penuh
//   "26 Nov - 2 Des (seharian)"      beberapa hari penuh
// "Seharian" = mulai 00.00 dan berakhir 00.00 atau 23.59 (blokir lama di database
// berakhir 23:59:59). Hari terakhir dihitung dari (akhir - 1 detik) karena akhir
// 00.00 sebenarnya milik hari berikutnya. Data rusak -> "-".
export function formatBlockRange(startIso: string, endIso: string, tz: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return "-";

  const startHm = hm(start, tz);
  const endHm = hm(end, tz);
  const lastMoment = new Date(end.getTime() - 1000);
  const sameDay = ymd(start, tz) === ymd(lastMoment, tz);
  const allDay = startHm === "00.00" && (endHm === "00.00" || endHm === "23.59");

  if (allDay) {
    return sameDay
      ? `${dayLabel(start, tz)} (seharian)`
      : `${dayLabel(start, tz)} - ${dayLabel(lastMoment, tz)} (seharian)`;
  }
  if (sameDay) return `${dayLabel(start, tz)}, ${startHm}-${endHm}`;
  return `${dayLabel(start, tz)} ${startHm} - ${dayLabel(end, tz)} ${endHm}`;
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

// Tautan wa.me untuk menghubungi pasien, atau null bila nomornya tidak masuk akal
// (halaman lalu menonaktifkan tombolnya). Nomor dibersihkan: hanya digit,
// "0812..." dan "00..." menjadi "62812...". Panjang 10-15 digit (batas E.164).
export function waLink(phone: string, text: string): string | null {
  let n = phone.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  else if (n.startsWith("0")) n = "62" + n.slice(1);
  if (n.length < 10 || n.length > 15) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

// Isi pesan WhatsApp ke pasien yang bentrok dengan blokir. Tanggal dan jam
// booking menurut zona klinik. Dikirim staf sendiri (tidak otomatis).
export function conflictMessage(
  c: Pick<Conflict, "patient_name" | "booked_time">,
  clinicName: string,
  tz: string,
): string {
  const when = new Date(c.booked_time);
  const date = new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(when);
  return (
    `Halo ${c.patient_name}, mohon maaf, jadwal Anda pada ${date} pukul ${hm(when, tz)} ` +
    `di ${clinicName} perlu diubah karena dokter berhalangan. ` +
    `Boleh kami bantu atur jadwal pengganti?`
  );
}
