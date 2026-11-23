// Layout bersama halaman staf klinik (/bookings, /schedules, /blocked-times, /akun). "(staff)" adalah
// grup rute: nama foldernya TIDAK muncul di alamat, hanya mengelompokkan halaman
// yang berbagi layout ini.
//
// StaffFrame (komponen klien) memegang tombol garis tiga dan sidebar yang awalnya
// tersembunyi; isi halaman dibungkus Shell oleh tiap halaman. Layout ini sendiri
// tetap komponen server, dan dipasang sekali sehingga sidebar tidak dimuat ulang
// saat pindah halaman.
import { StaffFrame } from "@/components/StaffFrame";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <StaffFrame>{children}</StaffFrame>;
}
