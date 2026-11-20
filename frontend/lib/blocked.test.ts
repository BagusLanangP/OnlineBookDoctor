// Tes untuk fungsi murni di lib/blocked.ts. Dijalankan dengan `npm test`
// (node:test bawaan Node, tanpa library tambahan).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blockedPath,
  buildBlockRange,
  clinicLocalToUtc,
  conflictMessage,
  formatBlockRange,
  waLink,
  type BlockedForm,
} from "./blocked.ts";

test("clinicLocalToUtc mengubah jam klinik (WIB, UTC+7) ke UTC", () => {
  assert.equal(clinicLocalToUtc("2026-11-20", "17:00", "Asia/Jakarta"), "2026-11-20T10:00:00.000Z");
  assert.equal(clinicLocalToUtc("2026-11-20", "19:30", "Asia/Jakarta"), "2026-11-20T12:30:00.000Z");
});

test("clinicLocalToUtc di tengah malam jatuh ke hari sebelumnya di UTC", () => {
  // 00.00 WIB 20 Nov = 17.00 UTC 19 Nov. Inilah awal blokir "Seharian".
  assert.equal(clinicLocalToUtc("2026-11-20", "00:00", "Asia/Jakarta"), "2026-11-19T17:00:00.000Z");
});

test("clinicLocalToUtc melewati batas bulan dan tahun", () => {
  assert.equal(clinicLocalToUtc("2026-12-01", "00:00", "Asia/Jakarta"), "2026-11-30T17:00:00.000Z");
  assert.equal(clinicLocalToUtc("2027-01-01", "03:00", "Asia/Jakarta"), "2026-12-31T20:00:00.000Z");
  // Tahun kabisat: 29 Feb ada.
  assert.equal(clinicLocalToUtc("2028-02-29", "12:00", "Asia/Jakarta"), "2028-02-29T05:00:00.000Z");
});

test("clinicLocalToUtc memakai zona klinik, bukan zona browser", () => {
  // Jam dinding yang sama, zona berbeda -> instan UTC berbeda.
  assert.equal(clinicLocalToUtc("2026-11-20", "17:00", "Asia/Makassar"), "2026-11-20T09:00:00.000Z"); // UTC+8
  assert.equal(clinicLocalToUtc("2026-11-20", "17:00", "Asia/Jayapura"), "2026-11-20T08:00:00.000Z"); // UTC+9
  assert.equal(clinicLocalToUtc("2026-11-20", "17:00", "UTC"), "2026-11-20T17:00:00.000Z");
});

test("clinicLocalToUtc benar di sekitar pergantian jam musim panas", () => {
  // New York: 8 Mar 2026 jam 02.00 -> 03.00 (maju). 03.00 sudah EDT (UTC-4).
  assert.equal(clinicLocalToUtc("2026-03-08", "03:00", "America/New_York"), "2026-03-08T07:00:00.000Z");
  // Sehari sebelumnya masih EST (UTC-5).
  assert.equal(clinicLocalToUtc("2026-03-07", "03:00", "America/New_York"), "2026-03-07T08:00:00.000Z");
});

test("blockedPath selalu meminta blokir mendatang", () => {
  assert.equal(blockedPath(1), "/practitioners/1/blocked-times?upcoming=1");
  assert.equal(blockedPath(7, 1), "/practitioners/7/blocked-times?upcoming=1");
});

test("blockedPath menambah page hanya bila lebih dari 1", () => {
  assert.equal(blockedPath(1, 2), "/practitioners/1/blocked-times?upcoming=1&page=2");
  assert.equal(blockedPath(3, 10), "/practitioners/3/blocked-times?upcoming=1&page=10");
});

// ---------------------------------------------------------------------------
// buildBlockRange
// ---------------------------------------------------------------------------
const TZ = "Asia/Jakarta";

// Form sebagian hari yang valid; tiap tes mengubah satu bagian saja.
function form(over: Partial<BlockedForm> = {}): BlockedForm {
  return {
    startDate: "2026-11-20",
    endDate: "2026-11-20",
    allDay: false,
    startTime: "17:00",
    endTime: "19:00",
    reason: "Urusan keluarga",
    ...over,
  };
}

// Mengambil nilai dari hasil yang sukses; gagal bila ternyata error.
function okValue(r: ReturnType<typeof buildBlockRange>) {
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  if (!r.ok) throw new Error("tidak tercapai");
  return r.value;
}
function errorOf(r: ReturnType<typeof buildBlockRange>): string {
  assert.equal(r.ok, false);
  if (r.ok) throw new Error("tidak tercapai");
  return r.error;
}

test("buildBlockRange sebagian hari: 17.00-19.00 WIB menjadi UTC", () => {
  assert.deepEqual(okValue(buildBlockRange(form(), TZ)), {
    start_time: "2026-11-20T10:00:00.000Z",
    end_time: "2026-11-20T12:00:00.000Z",
    reason: "Urusan keluarga",
  });
});

test("buildBlockRange seharian: 00.00 sampai 00.00 hari setelah tanggal selesai", () => {
  // Satu hari penuh, 20 Nov.
  const one = okValue(buildBlockRange(form({ allDay: true, startTime: "", endTime: "" }), TZ));
  assert.equal(one.start_time, "2026-11-19T17:00:00.000Z"); // 00.00 WIB 20 Nov
  assert.equal(one.end_time, "2026-11-20T17:00:00.000Z"); // 00.00 WIB 21 Nov
  // Cuti 26 Nov - 2 Des melewati pergantian bulan.
  const leave = okValue(buildBlockRange(form({ allDay: true, startDate: "2026-11-26", endDate: "2026-12-02" }), TZ));
  assert.equal(leave.start_time, "2026-11-25T17:00:00.000Z");
  assert.equal(leave.end_time, "2026-12-02T17:00:00.000Z"); // 00.00 WIB 3 Des
});

test("buildBlockRange seharian mengabaikan isi kolom jam", () => {
  const r = okValue(buildBlockRange(form({ allDay: true, startTime: "99:99", endTime: "x" }), TZ));
  assert.equal(r.start_time, "2026-11-19T17:00:00.000Z");
});

test("buildBlockRange boleh lintas hari", () => {
  const r = okValue(buildBlockRange(form({ endDate: "2026-11-21", startTime: "22:00", endTime: "06:00" }), TZ));
  assert.equal(r.start_time, "2026-11-20T15:00:00.000Z");
  assert.equal(r.end_time, "2026-11-20T23:00:00.000Z"); // 06.00 WIB 21 Nov
});

test("buildBlockRange memangkas spasi di alasan", () => {
  assert.equal(okValue(buildBlockRange(form({ reason: "  Rapat  " }), TZ)).reason, "Rapat");
});

test("buildBlockRange menolak tanggal kosong, salah format, atau tidak nyata", () => {
  const msg = "Tanggal mulai dan selesai wajib diisi.";
  assert.equal(errorOf(buildBlockRange(form({ startDate: "" }), TZ)), msg);
  assert.equal(errorOf(buildBlockRange(form({ endDate: "20-11-2026" }), TZ)), msg);
  assert.equal(errorOf(buildBlockRange(form({ startDate: "2026-02-30", endDate: "2026-02-30" }), TZ)), msg);
});

test("buildBlockRange menolak tanggal selesai sebelum tanggal mulai", () => {
  assert.equal(
    errorOf(buildBlockRange(form({ startDate: "2026-11-21", endDate: "2026-11-20" }), TZ)),
    "Tanggal selesai tidak boleh sebelum tanggal mulai.",
  );
});

test("buildBlockRange menolak jam kosong atau tidak nyata (hanya bila bukan seharian)", () => {
  const msg = "Jam mulai dan selesai wajib diisi.";
  assert.equal(errorOf(buildBlockRange(form({ startTime: "" }), TZ)), msg);
  assert.equal(errorOf(buildBlockRange(form({ endTime: "24:00" }), TZ)), msg);
  assert.equal(errorOf(buildBlockRange(form({ endTime: "19:60" }), TZ)), msg);
});

test("buildBlockRange menolak waktu selesai yang tidak setelah waktu mulai", () => {
  const msg = "Waktu selesai harus setelah waktu mulai.";
  assert.equal(errorOf(buildBlockRange(form({ startTime: "19:00", endTime: "17:00" }), TZ)), msg);
  assert.equal(errorOf(buildBlockRange(form({ startTime: "17:00", endTime: "17:00" }), TZ)), msg);
});

test("buildBlockRange menolak alasan kosong dan terlalu panjang", () => {
  assert.equal(errorOf(buildBlockRange(form({ reason: "   " }), TZ)), "Alasan wajib diisi.");
  assert.equal(okValue(buildBlockRange(form({ reason: "a".repeat(255) }), TZ)).reason.length, 255);
  assert.equal(errorOf(buildBlockRange(form({ reason: "a".repeat(256) }), TZ)), "Alasan maksimal 255 karakter.");
});

// ---------------------------------------------------------------------------
// formatBlockRange
// ---------------------------------------------------------------------------
test("formatBlockRange sebagian hari", () => {
  assert.equal(formatBlockRange("2026-11-20T10:00:00Z", "2026-11-20T12:00:00Z", TZ), "20 Nov, 17.00-19.00");
  // Format mikrodetik seperti yang dikirim Laravel.
  assert.equal(
    formatBlockRange("2026-11-20T08:00:00.000000Z", "2026-11-20T09:00:00.000000Z", TZ),
    "20 Nov, 15.00-16.00",
  );
});

test("formatBlockRange satu hari penuh dan beberapa hari penuh", () => {
  assert.equal(formatBlockRange("2026-11-19T17:00:00Z", "2026-11-20T17:00:00Z", TZ), "20 Nov (seharian)");
  assert.equal(formatBlockRange("2026-11-25T17:00:00Z", "2026-12-02T17:00:00Z", TZ), "26 Nov - 2 Des (seharian)");
});

test("formatBlockRange mengenali blokir lama yang berakhir 23:59:59", () => {
  // Seperti "Annual Leave" di database: 26 Nov 00.00 WIB sampai 2 Des 23:59:59 WIB.
  assert.equal(formatBlockRange("2026-11-25T17:00:00Z", "2026-12-02T16:59:59Z", TZ), "26 Nov - 2 Des (seharian)");
});

test("formatBlockRange lintas hari bukan seharian", () => {
  assert.equal(
    formatBlockRange("2026-11-20T10:00:00Z", "2026-11-21T02:00:00Z", TZ),
    "20 Nov 17.00 - 21 Nov 09.00",
  );
});

test("formatBlockRange: berakhir tepat 00.00 tetap dihitung hari sebelumnya", () => {
  // 22.00 WIB 20 Nov sampai 00.00 WIB 21 Nov: masih satu hari (20 Nov).
  assert.equal(formatBlockRange("2026-11-20T15:00:00Z", "2026-11-20T17:00:00Z", TZ), "20 Nov, 22.00-00.00");
});

test("formatBlockRange memakai zona klinik, bukan UTC", () => {
  // 17:00Z sudah tanggal berikutnya di Jakarta.
  assert.equal(formatBlockRange("2026-11-20T17:00:00Z", "2026-11-20T18:00:00Z", TZ), "21 Nov, 00.00-01.00");
});

test("formatBlockRange mengembalikan '-' untuk data rusak", () => {
  assert.equal(formatBlockRange("bukan-tanggal", "2026-11-20T12:00:00Z", TZ), "-");
  assert.equal(formatBlockRange("2026-11-20T10:00:00Z", "", TZ), "-");
  assert.equal(formatBlockRange("2026-11-20T12:00:00Z", "2026-11-20T10:00:00Z", TZ), "-"); // akhir sebelum awal
});

// ---------------------------------------------------------------------------
// waLink dan conflictMessage
// ---------------------------------------------------------------------------
test("waLink menormalkan nomor Indonesia", () => {
  const want = "https://wa.me/6281234560105?text=Halo";
  assert.equal(waLink("6281234560105", "Halo"), want);
  assert.equal(waLink("081234560105", "Halo"), want); // awalan 0
  assert.equal(waLink("+62 812-3456-0105", "Halo"), want); // tanda baca dan spasi
  assert.equal(waLink("0062 812 3456 0105", "Halo"), want); // awalan 00
});

test("waLink menandai nomor tidak masuk akal dengan null", () => {
  assert.equal(waLink("", "Halo"), null);
  assert.equal(waLink("abc", "Halo"), null);
  assert.equal(waLink("0812", "Halo"), null); // terlalu pendek
  assert.equal(waLink("62812345601059999", "Halo"), null); // lebih dari 15 digit
});

test("waLink mengamankan isi pesan di alamat", () => {
  const url = waLink("6281234560105", "Halo Budi & Sari? 100%")!;
  assert.equal(url, "https://wa.me/6281234560105?text=Halo%20Budi%20%26%20Sari%3F%20100%25");
});

test("conflictMessage memakai tanggal dan jam klinik", () => {
  assert.equal(
    conflictMessage({ patient_name: "Budi", booked_time: "2026-11-20T10:30:00Z" }, "Klinik Maju Jaya", TZ),
    "Halo Budi, mohon maaf, jadwal Anda pada 20 November 2026 pukul 17.30 di Klinik Maju Jaya " +
      "perlu diubah karena dokter berhalangan. Boleh kami bantu atur jadwal pengganti?",
  );
  // 17:00Z = 00.00 WIB hari berikutnya.
  assert.match(
    conflictMessage({ patient_name: "Sari", booked_time: "2026-11-20T17:00:00Z" }, "K", TZ),
    /pada 21 November 2026 pukul 00\.00/,
  );
});
