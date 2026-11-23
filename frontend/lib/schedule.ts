// Tipe dan fungsi MURNI untuk halaman Jadwal praktek (Task 12). Tanpa import
// runtime, jadi bisa dites langsung dengan `npm test` (lib/schedule.test.ts).
//
// Jam jadwal adalah jam LOKAL klinik ("09:00"), bukan UTC: tidak ada konversi
// zona di sini. Aturan validasi sama dengan SyncSchedulesRequest di Laravel.
import type { Conflict } from "./blocked.ts";

// Satu hari aktif seperti yang dikirim / diterima Laravel.
export type ScheduleRow = { day_of_week: number; start_time: string; end_time: string };

// GET /api/practitioners/{id}/schedules
export type WeekResponse = { practitioner_id: number; schedules: ScheduleRow[] };

// PUT: jadwal baru + pasien confirmed mendatang yang kini di luar jam praktek.
// outside_bookings = jumlah penuh; outside = daftar, maksimal 50.
export type SaveWeekResponse = WeekResponse & { outside_bookings: number; outside: Conflict[] };

// Satu baris form. Selalu ada 7; `working = false` berarti libur. Jam hari libur
// tetap disimpan supaya kembali muncul saat hari itu dinyalakan lagi.
export type DayState = { dow: number; working: boolean; start: string; end: string };

// Senin sampai Minggu (kebiasaan Indonesia). dow mengikuti Laravel: 0 = Minggu.
export const DAYS: { dow: number; label: string; short: string }[] = [
  { dow: 1, label: "Senin", short: "Sen" },
  { dow: 2, label: "Selasa", short: "Sel" },
  { dow: 3, label: "Rabu", short: "Rab" },
  { dow: 4, label: "Kamis", short: "Kam" },
  { dow: 5, label: "Jumat", short: "Jum" },
  { dow: 6, label: "Sabtu", short: "Sab" },
  { dow: 0, label: "Minggu", short: "Min" },
];

export const DEFAULT_HOURS = { start: "09:00", end: "17:00" } as const;

// Sama dengan AvailabilityService::SLOT_MINUTES.
export const SLOT_MINUTES = 30;

export function dayLabel(dow: number): string {
  return DAYS.find((d) => d.dow === dow)?.label ?? String(dow);
}

export function schedulePath(practitionerId: number): string {
  return `/practitioners/${practitionerId}/schedules`;
}

// "09:00" atau "09:00:00" -> menit sejak tengah malam; null bila bukan jam sah.
export function toMinutes(time: string): number | null {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Data server (hanya hari aktif) -> 7 baris form, urut DAYS.
export function buildWeek(rows: ScheduleRow[]): DayState[] {
  return DAYS.map(({ dow }) => {
    const row = rows.find((r) => r.day_of_week === dow);
    return row
      ? { dow, working: true, start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) }
      : { dow, working: false, start: DEFAULT_HOURS.start, end: DEFAULT_HOURS.end };
  });
}

// Isi PUT: hanya hari aktif, urut DAYS. Hari yang tidak dikirim = libur.
export function toPayload(week: DayState[]): { schedules: ScheduleRow[] } {
  return {
    schedules: week
      .filter((d) => d.working)
      .map((d) => ({ day_of_week: d.dow, start_time: d.start, end_time: d.end })),
  };
}

// Pesan untuk satu hari, atau null bila sah / libur.
export function validateDay(day: DayState): string | null {
  if (!day.working) return null;
  const s = toMinutes(day.start);
  const e = toMinutes(day.end);
  if (s === null) return "Isi jam mulai.";
  if (e === null) return "Isi jam selesai.";
  if (e <= s) return "Jam selesai harus setelah jam mulai.";
  return null;
}

// Jumlah slot 30 menit yang MUAT PENUH (aturan AvailabilityService): 09:00-17:00
// = 16 slot, 09:00-09:45 = 1 slot. Hari libur atau jam tak sah = 0.
export function slotCount(day: DayState): number {
  if (!day.working) return 0;
  const s = toMinutes(day.start);
  const e = toMinutes(day.end);
  if (s === null || e === null || e <= s) return 0;
  return Math.floor((e - s) / SLOT_MINUTES);
}

// Ada perubahan dibanding yang tersimpan? Jam hari libur tidak dihitung.
export function isWeekDirty(saved: ScheduleRow[], week: DayState[]): boolean {
  return JSON.stringify(toPayload(buildWeek(saved))) !== JSON.stringify(toPayload(week));
}

// Salin jam hari `fromDow` ke semua hari AKTIF lain (hari libur tidak dinyalakan).
export function copyHoursToActive(week: DayState[], fromDow: number): DayState[] {
  const src = week.find((d) => d.dow === fromDow);
  if (!src) return week;
  return week.map((d) => (d.working ? { ...d, start: src.start, end: src.end } : d));
}

// Body 422 Laravel -> pesan per hari. Kunci error memakai indeks baris yang
// DIKIRIM ("schedules.2.end_time"), jadi dipetakan lewat payload ke dow.
export function rowErrorsFrom422(body: unknown, payload: ScheduleRow[]): Record<number, string> {
  const out: Record<number, string> = {};
  if (typeof body !== "object" || body === null) return out;
  const errors = (body as { errors?: unknown }).errors;
  if (typeof errors !== "object" || errors === null) return out;
  for (const [key, list] of Object.entries(errors)) {
    const m = /^schedules\.(\d+)\.(\w+)$/.exec(key);
    if (!m || !Array.isArray(list)) continue;
    const row = payload[Number(m[1])];
    if (!row || out[row.day_of_week]) continue;
    out[row.day_of_week] =
      m[2] === "end_time" ? "Jam selesai harus setelah jam mulai." : "Jam di hari ini tidak sah.";
  }
  return out;
}

// Pesan WhatsApp untuk pasien yang booking-nya kini di luar jam praktek.
// Tanggal dan jam menurut zona klinik. Dikirim staf sendiri (tidak otomatis).
export function scheduleChangeMessage(
  c: Pick<Conflict, "patient_name" | "booked_time">,
  clinicName: string,
  doctorName: string,
  tz: string,
): string {
  const when = new Date(c.booked_time);
  const date = new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(when);
  const time = new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(when);
  return (
    `Halo ${c.patient_name}, jadwal praktek ${doctorName} di ${clinicName} berubah, ` +
    `sehingga booking Anda pada ${date} pukul ${time} perlu dijadwalkan ulang. ` +
    `Boleh kami bantu pilih waktu lain?`
  );
}
