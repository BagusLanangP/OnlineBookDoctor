// Bentuk balasan GET /api/user (lihat AuthController::me di Laravel), dipakai
// bersama oleh halaman staf (/bookings, /blocked-times). Hanya tipe: tidak ada
// kode yang berjalan di file ini.
// `clinic` bisa null bila akun belum terhubung ke klinik.
export type Clinic = { id: number; name: string; timezone: string };
export type Me = {
  user: { id: number; name: string; email: string };
  clinic: Clinic | null;
};
