// Alamat aplikasi Laravel. Login dan dashboard masih berjalan di sana,
// jadi semua tombol "Masuk" di homepage ini menuju ke alamat tersebut.
export const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8088"
).replace(/\/$/, "");

export const LOGIN_URL = `${APP_URL}/login`;
