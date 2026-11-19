// Tes untuk fungsi murni di lib/booking.ts. Dijalankan dengan `npm test`
// (node:test bawaan Node, tanpa library tambahan).
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingsPath, formatDate, shiftDate, todayIn } from "./booking.ts";

test("todayIn memakai zona waktu klinik", () => {
  const t = new Date("2026-11-17T17:00:00Z");
  assert.equal(todayIn("Asia/Jakarta", t), "2026-11-18");
  assert.equal(todayIn("Asia/Makassar", t), "2026-11-18");
  assert.equal(todayIn("UTC", t), "2026-11-17");
  assert.equal(todayIn("Asia/Jakarta", new Date("2026-11-17T16:59:59Z")), "2026-11-17");
});

test("shiftDate melewati batas bulan, tahun, dan tahun kabisat", () => {
  assert.equal(shiftDate("2026-11-30", 1), "2026-12-01");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDate("2028-03-01", -1), "2028-02-29");
});

test("formatDate menampilkan jam menurut zona waktu klinik", () => {
  assert.equal(formatDate("2026-11-17T17:00:00Z", "Asia/Jakarta"), "00.00");
  assert.equal(formatDate("2026-11-18T05:00:00Z", "Asia/Jakarta"), "12.00");
  assert.equal(formatDate("2026-11-18T16:59:59Z", "Asia/Makassar"), "00.59");
  // Format dengan mikrodetik seperti yang dikirim Laravel.
  assert.equal(formatDate("2026-11-17T17:00:00.000000Z", "Asia/Jakarta"), "00.00");
});

test("formatDate mengembalikan '-' untuk ISO rusak", () => {
  assert.equal(formatDate("bukan-tanggal", "Asia/Jakarta"), "-");
});

test("bookingsPath melewatkan filter kosong dan page 1", () => {
  assert.equal(
    bookingsPath({ date: "2026-11-18", status: "", practitionerId: "", page: 1 }),
    "/bookings?date=2026-11-18",
  );
  assert.equal(
    bookingsPath({ date: "2026-11-18", status: "confirmed", practitionerId: "3", page: 2 }),
    "/bookings?date=2026-11-18&status=confirmed&practitioner_id=3&page=2",
  );
});
