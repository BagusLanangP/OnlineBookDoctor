// Potongan antarmuka Praktika yang nyata: Dashboard dan editor jadwal mingguan.
// Strukturnya meniru halaman aslinya (resources/js/Pages di aplikasi Laravel).
// Isinya contoh: nama pasien, dokter, dan jam hanya fiktif untuk ilustrasi,
// dan labelnya diterjemahkan ke Bahasa Indonesia (aplikasinya sendiri masih berbahasa Inggris).
import type { ReactNode } from "react";


// Kelas di bawah meniru kartu aplikasi asli: bayangan halus dan garis pemisah.
// Pengecualian disengaja untuk potongan antarmuka (data-ui), bukan gaya halaman.
const CARD = "overflow-hidden bg-white shadow-sm sm:rounded-lg"; // taste-skill-ignore
const CARD_HEAD = "border-b border-gray-100 px-6 py-4 text-lg font-medium text-gray-900"; // taste-skill-ignore
const DIVIDED = "divide-y divide-gray-100"; // taste-skill-ignore
const EDITOR_HEAD = "border-b border-gray-100 px-6 py-4"; // taste-skill-ignore
const EDITOR_FOOT = "flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-4"; // taste-skill-ignore

const STATUS = {
  confirmed: ["Dikonfirmasi", "bg-blue-100 text-blue-800"],
  completed: ["Selesai", "bg-green-100 text-green-800"],
  cancelled: ["Batal", "bg-gray-100 text-gray-600"],
} as const;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={CARD}>
      <h3 className={CARD_HEAD}>
        {title}
      </h3>
      <div className="p-6">{children}</div>
    </section>
  );
}

const BOOKINGS = [
  { time: "08.30", name: "Budi Santoso", reason: "Sakit gigi", status: "confirmed", doctor: "dr. Sari Wulandari" },
  { time: "09.30", name: "Ayu Lestari", reason: "Kontrol rutin", status: "completed", doctor: "dr. Sari Wulandari" },
  { time: "11.00", name: "Rudi Hartono", reason: "Konsultasi", status: "confirmed", doctor: "dr. Sari Wulandari" },
] as const;

export function TodayBookingsCard() {
  return (
    <div data-ui role="img" aria-label="Contoh kartu Booking hari ini di dashboard Praktika, berisi tiga booking dengan jam, nama pasien, keperluan, dan status.">
      <Card title={`Booking hari ini (${BOOKINGS.length})`}>
        <ul className={DIVIDED}>
          {BOOKINGS.map((b) => (
            <li key={b.time} className="py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words text-sm text-gray-900">
                  <span className="font-semibold">{b.time}</span>
                  {" · "}
                  {b.name}
                  {" — "}
                  {b.reason}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[b.status][1]}`}
                >
                  {STATUS[b.status][0]}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{b.doctor}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

const WEEK = [
  { day: "Senin", today: true, rows: ["dr. Sari Wulandari 08.00–14.00"] },
  { day: "Selasa", rows: ["dr. Sari Wulandari 08.00–14.00"] },
  { day: "Rabu", rows: ["dr. Sari Wulandari 15.00–20.00"] },
  { day: "Kamis", rows: ["dr. Sari Wulandari 08.00–14.00"] },
  { day: "Jumat", rows: ["dr. Sari Wulandari 08.00–11.30"] },
  { day: "Sabtu", rows: [] },
  { day: "Minggu", rows: [] },
] as const;

export function WeekScheduleCard() {
  return (
    <div data-ui role="img" aria-label="Contoh kartu Jadwal minggu ini di dashboard Praktika, berisi tujuh hari dengan jam praktek dokter; Sabtu dan Minggu libur.">
      <Card title="Jadwal minggu ini">
        <ul className="space-y-2">
          {WEEK.map((d) => {
            const today = "today" in d && d.today;
            return (
              <li
                key={d.day}
                className={`rounded-md px-3 py-2 text-sm ${today ? "bg-blue-50 ring-1 ring-blue-200" : ""}`}
              >
                <p className={`font-medium ${today ? "text-blue-700" : "text-gray-900"}`}>
                  {d.day}
                  {today && <span className="ml-2 text-xs font-normal">(hari ini)</span>}
                </p>
                {d.rows.length === 0 ? (
                  <p className="text-gray-500">Libur</p>
                ) : (
                  d.rows.map((r) => (
                    <p key={r} className="text-gray-600">
                      {r}
                    </p>
                  ))
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

export function PractitionersCard() {
  return (
    <div data-ui role="img" aria-label="Contoh kartu Dokter di dashboard Praktika, berisi dua dokter beserta spesialisasinya.">
      <Card title="Dokter (2)">
        <ul className={DIVIDED}>
          <li className="py-3">
            <p className="text-sm font-medium text-gray-900">dr. Sari Wulandari</p>
            <p className="text-xs text-gray-500">Dokter umum</p>
          </li>
          <li className="py-3">
            <p className="text-sm font-medium text-gray-900">drg. Ahmad Fauzi</p>
            <p className="text-xs text-gray-500">Dokter gigi</p>
          </li>
        </ul>
      </Card>
    </div>
  );
}

// Editor jadwal mingguan. Bar 24 jam menampilkan bagian jam kerja dari 00.00 sampai 24.00.
const EDITOR_ROWS = [
  { day: "Senin", on: true, start: "08.00", end: "14.00", from: 480, to: 840 },
  { day: "Selasa", on: true, start: "08.00", end: "14.00", from: 480, to: 840 },
  { day: "Rabu", on: true, start: "15.00", end: "20.00", from: 900, to: 1200 },
  { day: "Sabtu", on: false },
] as const;

export function ScheduleEditorFragment() {
  return (
    <div
      data-ui
      role="img"
      aria-label="Contoh editor jadwal mingguan Praktika: hari praktek dengan jam mulai dan selesai, serta bar 24 jam sebagai pratinjau. Sabtu libur."
      className={CARD}
    >
      <div className={EDITOR_HEAD}>
        <p className="text-lg font-medium text-gray-900">Jadwal mingguan</p>
        <p className="text-sm text-gray-500">dr. Sari Wulandari</p>
      </div>
      <ul className={`${DIVIDED} px-6`}>
        {EDITOR_ROWS.map((r) => (
          <li key={r.day} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <span
                  className={`inline-block h-4 w-4 rounded border ${r.on ? "border-blue-600 bg-blue-600" : "border-gray-300"}`}
                />
                {r.day}
              </span>
              {r.on ? (
                <span className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="rounded-md border border-gray-300 px-2 py-1">{r.start}</span>
                  <span>–</span>
                  <span className="rounded-md border border-gray-300 px-2 py-1">{r.end}</span>
                </span>
              ) : (
                <span className="text-sm text-gray-500">Libur</span>
              )}
            </div>
            {r.on && (
              <div aria-hidden="true" className="relative mt-2 h-2 rounded-full bg-gray-100">
                <div
                  className="grow absolute inset-y-0 rounded-full bg-blue-500"
                  style={{
                    left: `${(r.from / 1440) * 100}%`,
                    width: `${((r.to - r.from) / 1440) * 100}%`,
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className={EDITOR_FOOT}>
        <span className="text-sm text-gray-600">3 hari kerja, 17 jam per minggu</span>
        <span className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">Simpan</span>
      </div>
    </div>
  );
}
