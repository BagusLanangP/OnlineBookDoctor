// Pembungkus endpoint jadwal mingguan (Task 12). Tanpa logika: validasi dan
// pengolahan form ada di lib/schedule.ts.
import { api } from "@/lib/api";
import { schedulePath, type SaveWeekResponse, type ScheduleRow, type WeekResponse } from "@/lib/schedule";

// GET: hari aktif satu dokter, jam lokal klinik "HH:mm".
export function fetchWeek(practitionerId: number): Promise<WeekResponse> {
  return api<WeekResponse>(schedulePath(practitionerId));
}

// PUT: kirim hanya hari aktif (hari lain = libur). Balasan memuat pasien
// confirmed mendatang yang kini di luar jam praktek (booking mereka tidak diubah).
export function saveWeek(practitionerId: number, schedules: ScheduleRow[]): Promise<SaveWeekResponse> {
  return api<SaveWeekResponse>(schedulePath(practitionerId), {
    method: "PUT",
    body: JSON.stringify({ schedules }),
  });
}
