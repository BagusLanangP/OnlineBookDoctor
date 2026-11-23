// Pembungkus endpoint profil klinik dan dokter (Task 11). Tanpa logika: validasi
// dan pratinjau ada di lib/clinic.ts.
import { api } from "@/lib/api";
import type { Practitioner } from "@/lib/booking";
import type { ClinicForm, ClinicProfile, PractitionerForm } from "@/lib/clinic";

// GET: profil lengkap klinik milik pengguna.
export function fetchClinic(): Promise<ClinicProfile> {
  return api<ClinicProfile>("/clinic");
}

// PUT: semua kolom dikirim; balasan = profil tersimpan (nomor sudah dinormalkan).
export function updateClinic(form: ClinicForm): Promise<ClinicProfile> {
  return api<ClinicProfile>("/clinic", { method: "PUT", body: JSON.stringify(form) });
}

export function createPractitioner(form: PractitionerForm): Promise<Practitioner> {
  return api<Practitioner>("/practitioners", { method: "POST", body: JSON.stringify(form) });
}

export function updatePractitioner(id: number, form: PractitionerForm): Promise<Practitioner> {
  return api<Practitioner>(`/practitioners/${id}`, { method: "PUT", body: JSON.stringify(form) });
}

// DELETE: 204 bila berhasil; 409 bila dokter sudah punya booking (riwayat pasien).
export function deletePractitioner(id: number): Promise<void> {
  return api<void>(`/practitioners/${id}`, { method: "DELETE" });
}
