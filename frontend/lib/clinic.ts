// Tipe dan fungsi MURNI untuk halaman Akun (Task 11): profil klinik, dokter,
// dan pratinjau "seperti yang dilihat pasien". Tanpa import runtime, jadi bisa
// dites langsung dengan `npm test` (lib/clinic.test.ts).
//
// Aturan validasi di sini SAMA dengan UpdateClinicRequest / SavePractitionerRequest
// di Laravel, supaya staf melihat pesan sebelum mengirim. Server tetap penentu akhir.
import type { Practitioner } from "./booking.ts";

// Bentuk balasan GET/PUT /api/clinic (Clinic::PROFILE_FIELDS di Laravel).
export type ClinicProfile = {
  id: number;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  maps_url: string | null;
  phone: string;
  whatsapp_number: string;
  timezone: string;
};

// Isi form: semua teks (kolom kosong = ""), tanpa id.
export type ClinicForm = Omit<ClinicProfile, "id" | "description" | "address" | "city" | "maps_url"> & {
  description: string;
  address: string;
  city: string;
  maps_url: string;
};
export type ClinicField = keyof ClinicForm;
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

// Zona waktu yang boleh dipilih (Clinic::TIMEZONES di Laravel).
export const TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Jakarta", label: "WIB, Asia/Jakarta (UTC+7)" },
  { value: "Asia/Makassar", label: "WITA, Asia/Makassar (UTC+8)" },
  { value: "Asia/Jayapura", label: "WIT, Asia/Jayapura (UTC+9)" },
];

export const LIMITS = { name: 255, description: 300, address: 500, city: 100, maps_url: 2048 } as const;

// ---------------------------------------------------------------------------
// Form <-> data server
// ---------------------------------------------------------------------------

export function formFromProfile(p: ClinicProfile): ClinicForm {
  return {
    name: p.name,
    description: p.description ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    maps_url: p.maps_url ?? "",
    phone: p.phone,
    whatsapp_number: p.whatsapp_number,
    timezone: p.timezone,
  };
}

// Isi yang dikirim ke PUT /api/clinic: spasi di tepi dibuang. Teks kosong dikirim
// "" dan diubah Laravel menjadi null.
export function payloadFrom(form: ClinicForm): ClinicForm {
  const out = { ...form };
  for (const k of Object.keys(out) as ClinicField[]) out[k] = out[k].trim();
  return out;
}

// Ada perubahan dibanding yang tersimpan? Spasi di tepi diabaikan; nomor
// dibandingkan setelah dinormalkan ("0812..." sama dengan "62812...").
export function isClinicDirty(saved: ClinicProfile, form: ClinicForm): boolean {
  const a = payloadFrom(formFromProfile(saved));
  const b = payloadFrom(form);
  return (Object.keys(a) as ClinicField[]).some((k) =>
    k === "phone" || k === "whatsapp_number"
      ? normalizePhone(a[k]) !== normalizePhone(b[k])
      : a[k] !== b[k],
  );
}

// ---------------------------------------------------------------------------
// Nomor telepon
// ---------------------------------------------------------------------------

// Sama dengan Clinic::normalizePhone: hanya digit, "0812" / "0062" -> "62...".
export function normalizePhone(phone: string): string {
  let n = phone.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  else if (n.startsWith("0")) n = "62" + n.slice(1);
  return n;
}

export function isValidPhone(phone: string): boolean {
  return /^62\d{8,13}$/.test(normalizePhone(phone));
}

// "6281234567890" -> "+62 812-3456-7890". Nomor tak sah ditampilkan apa adanya.
export function formatPhone(phone: string): string {
  const n = normalizePhone(phone);
  if (!/^62\d{8,13}$/.test(n)) return phone.trim();
  const rest = n.slice(2);
  const parts = [rest.slice(0, 3), rest.slice(3, 7), rest.slice(7)].filter(Boolean);
  return `+62 ${parts.join("-")}`;
}

// Tautan wa.me ke nomor klinik (tanpa pesan), atau null bila nomor tak sah.
export function clinicWaLink(phone: string): string | null {
  return isValidPhone(phone) ? `https://wa.me/${normalizePhone(phone)}` : null;
}

// ---------------------------------------------------------------------------
// Validasi
// ---------------------------------------------------------------------------

function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    return false;
  }
}

// Pesan per kolom (kosong = form sah).
export function validateClinicForm(form: ClinicForm): FieldErrors<ClinicField> {
  const f = payloadFrom(form);
  const e: FieldErrors<ClinicField> = {};
  if (!f.name) e.name = "Nama klinik wajib diisi.";
  else if (f.name.length > LIMITS.name) e.name = `Nama klinik paling banyak ${LIMITS.name} karakter.`;
  if (f.description.length > LIMITS.description)
    e.description = `Deskripsi paling banyak ${LIMITS.description} karakter.`;
  if (f.address.length > LIMITS.address) e.address = `Alamat paling banyak ${LIMITS.address} karakter.`;
  if (f.city.length > LIMITS.city) e.city = `Kota paling banyak ${LIMITS.city} karakter.`;
  if (f.maps_url) {
    if (f.maps_url.length > LIMITS.maps_url) e.maps_url = "Tautan peta terlalu panjang.";
    else if (!isHttpsUrl(f.maps_url)) e.maps_url = "Tautan peta harus alamat https://.";
  }
  if (!f.phone) e.phone = "Nomor telepon wajib diisi.";
  else if (!isValidPhone(f.phone)) e.phone = "Nomor telepon harus 10-15 digit, contoh 0812 3456 7890.";
  if (!f.whatsapp_number) e.whatsapp_number = "Nomor WhatsApp wajib diisi.";
  else if (!isValidPhone(f.whatsapp_number))
    e.whatsapp_number = "Nomor WhatsApp harus 10-15 digit, contoh 0812 3456 7890.";
  if (!TIMEZONES.some((t) => t.value === f.timezone)) e.timezone = "Pilih zona waktu WIB, WITA, atau WIT.";
  return e;
}

export type PractitionerForm = { name: string; specialty: string };

// `others` = dokter lain di klinik (tanpa dokter yang sedang diubah).
export function validatePractitionerForm(
  form: PractitionerForm,
  others: Pick<Practitioner, "name">[],
): FieldErrors<keyof PractitionerForm> {
  const name = form.name.trim();
  const e: FieldErrors<keyof PractitionerForm> = {};
  if (!name) e.name = "Nama dokter wajib diisi.";
  else if (name.length > 255) e.name = "Nama dokter paling banyak 255 karakter.";
  else if (others.some((p) => p.name.trim().toLowerCase() === name.toLowerCase()))
    e.name = "Sudah ada dokter dengan nama ini di klinik Anda.";
  if (form.specialty.trim().length > 255) e.specialty = "Spesialisasi paling banyak 255 karakter.";
  return e;
}

// Pesan per kolom dari body 422 Laravel: { errors: { phone: ["..."] } } -> { phone: "..." }.
export function serverFieldErrors<K extends string>(body: unknown, fields: readonly K[]): FieldErrors<K> {
  const out: FieldErrors<K> = {};
  if (typeof body !== "object" || body === null) return out;
  const errors = (body as { errors?: unknown }).errors;
  if (typeof errors !== "object" || errors === null) return out;
  for (const k of fields) {
    const list = (errors as Record<string, unknown>)[k];
    if (Array.isArray(list) && typeof list[0] === "string") out[k] = list[0];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pratinjau
// ---------------------------------------------------------------------------

export type ClinicPreview = {
  name: string;
  description: string | null;
  location: string | null; // "Jl. ..., Denpasar"
  mapsUrl: string | null; // hanya bila https sah
  phone: string | null; // "+62 812-..."
  whatsapp: { label: string; href: string } | null;
  timezoneLabel: string; // "WIB" / "WITA" / "WIT" / nilai mentah
  doctorCount: number;
  doctors: { id: number; name: string; specialty: string | null }[];
};

// Isi pratinjau dari form SAAT INI (belum tersimpan pun). Kolom kosong = null
// (tidak ditampilkan). Jumlah dokter selalu dihitung dari daftar.
export function previewFrom(form: ClinicForm, practitioners: Practitioner[]): ClinicPreview {
  const f = payloadFrom(form);
  const location = [f.address, f.city].filter(Boolean).join(", ") || null;
  const wa = clinicWaLink(f.whatsapp_number);
  const tz = TIMEZONES.find((t) => t.value === f.timezone);
  const doctors = [...practitioners]
    .sort((a, b) => a.name.localeCompare(b.name, "id"))
    .map((p) => ({ id: p.id, name: p.name, specialty: p.specialty?.trim() || null }));
  return {
    name: f.name || "Nama klinik",
    description: f.description || null,
    location,
    mapsUrl: f.maps_url && isHttpsUrl(f.maps_url) ? f.maps_url : null,
    phone: f.phone ? formatPhone(f.phone) : null,
    whatsapp: wa ? { label: formatPhone(f.whatsapp_number), href: wa } : null,
    timezoneLabel: tz ? tz.label.split(",")[0] : f.timezone,
    doctorCount: doctors.length,
    doctors,
  };
}
