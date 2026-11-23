// Tes untuk fungsi murni di lib/clinic.ts (Task 11). Dijalankan dengan `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPhone,
  formFromProfile,
  isClinicDirty,
  normalizePhone,
  payloadFrom,
  previewFrom,
  serverFieldErrors,
  validateClinicForm,
  validatePractitionerForm,
  type ClinicProfile,
} from "./clinic.ts";

const saved: ClinicProfile = {
  id: 1,
  name: "Klinik Maju Jaya",
  description: null,
  address: "Jl. Teuku Umar 10",
  city: "Denpasar",
  maps_url: null,
  phone: "6281234567890",
  whatsapp_number: "6281234567891",
  timezone: "Asia/Makassar",
};

test("normalizePhone sama dengan aturan server", () => {
  assert.equal(normalizePhone("0812-3456-7890"), "6281234567890");
  assert.equal(normalizePhone("+62 812 3456 7890"), "6281234567890");
  assert.equal(normalizePhone("0062 812 3456"), "628123456");
});

test("formatPhone menampilkan +62 dengan pemisah, nomor tak sah apa adanya", () => {
  assert.equal(formatPhone("6281234567890"), "+62 812-3456-7890");
  assert.equal(formatPhone("08123456789"), "+62 812-3456-789");
  assert.equal(formatPhone(" 123 "), "123");
});

test("formFromProfile mengubah null menjadi teks kosong", () => {
  const f = formFromProfile(saved);
  assert.equal(f.description, "");
  assert.equal(f.maps_url, "");
  assert.equal(f.city, "Denpasar");
});

test("payloadFrom membuang spasi di tepi", () => {
  const p = payloadFrom({ ...formFromProfile(saved), name: "  Klinik  " });
  assert.equal(p.name, "Klinik");
});

test("isClinicDirty: tidak berubah, spasi, dan nomor dengan format lain dianggap sama", () => {
  const f = formFromProfile(saved);
  assert.equal(isClinicDirty(saved, f), false);
  assert.equal(isClinicDirty(saved, { ...f, name: "Klinik Maju Jaya " }), false);
  assert.equal(isClinicDirty(saved, { ...f, phone: "0812-3456-7890" }), false);
  assert.equal(isClinicDirty(saved, { ...f, city: "Badung" }), true);
  assert.equal(isClinicDirty(saved, { ...f, timezone: "Asia/Jakarta" }), true);
});

test("validateClinicForm: form sah tanpa pesan", () => {
  assert.deepEqual(validateClinicForm(formFromProfile(saved)), {});
});

test("validateClinicForm: kolom wajib, nomor, zona waktu, tautan peta", () => {
  const e = validateClinicForm({
    ...formFromProfile(saved),
    name: "  ",
    phone: "123",
    whatsapp_number: "",
    timezone: "UTC",
    maps_url: "http://maps.example.com",
    description: "a".repeat(301),
  });
  assert.deepEqual(Object.keys(e).sort(), [
    "description",
    "maps_url",
    "name",
    "phone",
    "timezone",
    "whatsapp_number",
  ]);
});

test("validateClinicForm menerima tautan peta https", () => {
  const e = validateClinicForm({ ...formFromProfile(saved), maps_url: "https://maps.app.goo.gl/abc" });
  assert.equal(e.maps_url, undefined);
});

test("validatePractitionerForm: wajib dan nama ganda (tanpa beda huruf besar)", () => {
  assert.equal(validatePractitionerForm({ name: " ", specialty: "" }, []).name, "Nama dokter wajib diisi.");
  assert.ok(validatePractitionerForm({ name: "dr. ayu", specialty: "" }, [{ name: "Dr. Ayu" }]).name);
  assert.deepEqual(validatePractitionerForm({ name: "Dr. Budi", specialty: "Anak" }, [{ name: "Dr. Ayu" }]), {});
});

test("serverFieldErrors mengambil pesan pertama per kolom yang diminta", () => {
  const body = { message: "x", errors: { phone: ["Sudah dipakai.", "lain"], other: ["abaikan"] } };
  assert.deepEqual(serverFieldErrors(body, ["phone", "name"] as const), { phone: "Sudah dipakai." });
  assert.deepEqual(serverFieldErrors(null, ["phone"] as const), {});
});

test("previewFrom: hanya kolom terisi, jumlah dokter dari daftar, urut nama", () => {
  const p = previewFrom(formFromProfile(saved), [
    { id: 2, name: "Dr. Siti", specialty: "" },
    { id: 1, name: "Dr. Ahmad", specialty: "Umum" },
  ]);
  assert.equal(p.description, null);
  assert.equal(p.mapsUrl, null);
  assert.equal(p.location, "Jl. Teuku Umar 10, Denpasar");
  assert.equal(p.phone, "+62 812-3456-7890");
  assert.deepEqual(p.whatsapp, { label: "+62 812-3456-7891", href: "https://wa.me/6281234567891" });
  assert.equal(p.timezoneLabel, "WITA");
  assert.equal(p.doctorCount, 2);
  assert.deepEqual(
    p.doctors.map((d) => [d.name, d.specialty]),
    [
      ["Dr. Ahmad", "Umum"],
      ["Dr. Siti", null],
    ],
  );
});

test("previewFrom: lokasi hanya kota, nama kosong diberi pengganti", () => {
  const p = previewFrom({ ...formFromProfile(saved), address: "", name: "" }, []);
  assert.equal(p.location, "Denpasar");
  assert.equal(p.name, "Nama klinik");
  assert.equal(p.doctorCount, 0);
});
