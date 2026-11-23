// Tes untuk fungsi murni di lib/schedule.ts (Task 12). Dijalankan dengan `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildWeek,
  copyHoursToActive,
  isWeekDirty,
  rowErrorsFrom422,
  scheduleChangeMessage,
  slotCount,
  toMinutes,
  toPayload,
  validateDay,
  type DayState,
} from "./schedule.ts";

const day = (patch: Partial<DayState> = {}): DayState => ({
  dow: 1,
  working: true,
  start: "09:00",
  end: "17:00",
  ...patch,
});

test("toMinutes menerima HH:mm dan HH:mm:ss, menolak yang lain", () => {
  assert.equal(toMinutes("09:30"), 570);
  assert.equal(toMinutes("17:00:00"), 1020);
  assert.equal(toMinutes(""), null);
  assert.equal(toMinutes("24:00"), null);
  assert.equal(toMinutes("9:00"), null);
});

test("buildWeek: 7 baris Senin..Minggu, hari tanpa jadwal libur dengan jam bawaan", () => {
  const w = buildWeek([
    { day_of_week: 0, start_time: "08:00", end_time: "12:00" },
    { day_of_week: 1, start_time: "09:00:00", end_time: "15:00:00" },
  ]);
  assert.deepEqual(
    w.map((d) => d.dow),
    [1, 2, 3, 4, 5, 6, 0],
  );
  assert.deepEqual(w[0], { dow: 1, working: true, start: "09:00", end: "15:00" });
  assert.deepEqual(w[1], { dow: 2, working: false, start: "09:00", end: "17:00" });
  assert.deepEqual(w[6], { dow: 0, working: true, start: "08:00", end: "12:00" });
});

test("toPayload hanya mengirim hari aktif, Minggu terakhir", () => {
  const w = buildWeek([]);
  w[0].working = true; // Senin
  w[6].working = true; // Minggu
  assert.deepEqual(toPayload(w), {
    schedules: [
      { day_of_week: 1, start_time: "09:00", end_time: "17:00" },
      { day_of_week: 0, start_time: "09:00", end_time: "17:00" },
    ],
  });
});

test("validateDay: libur selalu sah; kosong; selesai harus setelah mulai", () => {
  assert.equal(validateDay(day({ working: false, start: "" })), null);
  assert.equal(validateDay(day()), null);
  assert.equal(validateDay(day({ start: "" })), "Isi jam mulai.");
  assert.equal(validateDay(day({ end: "" })), "Isi jam selesai.");
  assert.equal(validateDay(day({ end: "09:00" })), "Jam selesai harus setelah jam mulai.");
  assert.equal(validateDay(day({ end: "08:00" })), "Jam selesai harus setelah jam mulai.");
});

test("slotCount mengikuti aturan muat penuh AvailabilityService", () => {
  assert.equal(slotCount(day()), 16);
  assert.equal(slotCount(day({ end: "09:45" })), 1);
  assert.equal(slotCount(day({ end: "09:15" })), 0);
  assert.equal(slotCount(day({ working: false })), 0);
  assert.equal(slotCount(day({ end: "08:00" })), 0);
});

test("isWeekDirty: jam hari libur tidak dihitung", () => {
  const saved = [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }];
  const w = buildWeek(saved);
  assert.equal(isWeekDirty(saved, w), false);
  w[1] = { ...w[1], start: "10:00" }; // Selasa libur, jam diubah
  assert.equal(isWeekDirty(saved, w), false);
  w[1] = { ...w[1], working: true };
  assert.equal(isWeekDirty(saved, w), true);
  assert.equal(isWeekDirty(saved, buildWeek([{ ...saved[0], end_time: "16:00" }])), true);
});

test("copyHoursToActive menyalin ke hari aktif saja", () => {
  const w = buildWeek([
    { day_of_week: 1, start_time: "08:00", end_time: "12:00" },
    { day_of_week: 3, start_time: "13:00", end_time: "20:00" },
  ]);
  const out = copyHoursToActive(w, 1);
  assert.deepEqual(out.find((d) => d.dow === 3), { dow: 3, working: true, start: "08:00", end: "12:00" });
  assert.deepEqual(out.find((d) => d.dow === 2), w.find((d) => d.dow === 2));
});

test("rowErrorsFrom422 memetakan indeks baris terkirim ke hari", () => {
  const payload = [
    { day_of_week: 1, start_time: "09:00", end_time: "17:00" },
    { day_of_week: 3, start_time: "12:00", end_time: "12:00" },
  ];
  const body = { errors: { "schedules.1.end_time": ["must be after"], schedules: ["x"] } };
  assert.deepEqual(rowErrorsFrom422(body, payload), { 3: "Jam selesai harus setelah jam mulai." });
  assert.deepEqual(rowErrorsFrom422(null, payload), {});
});

test("scheduleChangeMessage memakai jam zona klinik", () => {
  const msg = scheduleChangeMessage(
    { patient_name: "Budi", booked_time: "2030-01-07T02:00:00Z" },
    "Klinik Maju Jaya",
    "Dr. Ayu",
    "Asia/Jakarta",
  );
  assert.match(msg, /^Halo Budi, jadwal praktek Dr\. Ayu di Klinik Maju Jaya berubah/);
  assert.match(msg, /Senin, 7 Januari/);
  assert.match(msg, /09\.00/);
});
