"use client";

// Halaman daftar booking (Task 9c).
//
// Alur singkat:
//  1. BookingsPage memuat /api/user (butuh zona waktu klinik) dan daftar dokter.
//  2. Setelah keduanya siap, BookingsView menampilkan booking satu hari
//     (default: hari ini menurut zona waktu klinik) lewat fetchBookings().
//  3. Tab status, pilihan dokter, tombol tanggal, dan paginasi mengubah
//     `filters`; perubahan itu otomatis memicu pengambilan data baru.
//  4. "Selesai" dan "Batal" memanggil API, lalu daftar dimuat ulang.
//
// Pertanyaan yang dijawab layar ini: "Siapa pasien hari ini, dan siapa
// berikutnya?" Karena itu pasien berikutnya disebut di bawah judul dan
// barisnya ditandai warna aksen.
//
// Kode ini berjalan di BROWSER ("use client"), dan data diambil dari Laravel
// lewat lib/booking-api.ts -> lib/api.ts. Gaya ada di globals.css (kelas bk__*).
//
// Istilah React yang dipakai di file ini:
//  - Komponen  : fungsi yang mengembalikan tampilan (JSX). Contoh: Shell (components/Shell.tsx), BookingsView.
//  - Props     : masukan komponen, ditulis seperti atribut HTML: <Shell clinicName="...">.
//  - useState  : "ingatan" komponen. Saat nilainya diubah lewat setter (setFilters dll.),
//                React menggambar ulang komponen dengan nilai baru.
//  - useEffect : kode yang dijalankan SETELAH tampilan digambar, misalnya mengambil data.
//                Ia berjalan lagi bila salah satu nilai di daftar dependensinya berubah.
//  - useRef    : kotak nilai yang tidak memicu gambar ulang dan langsung berubah
//                (tidak menunggu render berikutnya).
//  - useRouter : alat pindah halaman dari kode, contoh router.replace("/login").
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";
import type { Clinic, Me } from "@/lib/me";
import {
  STATUS_LABEL,
  formatDate,
  shiftDate,
  todayIn,
  type Booking,
  type BookingFilters,
  type BookingStatus,
  type Paginated,
  type Practitioner,
} from "@/lib/booking";
import {
  cancelBooking,
  fetchBookings,
  fetchPractitioners,
  markCompleted,
} from "@/lib/booking-api";

const PER_PAGE = 20; // sama dengan paginate(20) di Laravel
const STATUS_OPTIONS: BookingStatus[] = ["confirmed", "completed", "cancelled"];

// Pilihan tab status: "Semua" + tiga status. `...STATUS_OPTIONS.map(...)`
// (tiga titik = spread) menuangkan isi array hasil map ke dalam array ini,
// jadi hasil akhirnya empat objek {value, label} berderet.
const STATUS_FILTERS: { value: BookingFilters["status"]; label: string }[] = [
  { value: "", label: "Semua" },
  ...STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
];

// "2026-11-18" -> "Rabu, 18 November 2026". Dibuat di UTC supaya zona waktu
// browser tidak menggeser harinya.
function longDate(date: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

// "6281234560105" -> "+62 812-3456-0105". Nomor lain ditampilkan apa adanya.
// Regex ^62(\d{3})(\d{4})(\d+)$ memecah nomor jadi tiga kelompok angka
// setelah "62"; m[1], m[2], m[3] adalah isi tiap kelompok. Bila tidak cocok,
// `m` bernilai null dan nomor asli dikembalikan.
function formatPhone(phone: string): string {
  const m = phone.match(/^62(\d{3})(\d{4})(\d+)$/);
  return m ? `+62 ${m[1]}-${m[2]}-${m[3]}` : phone;
}

// Panah untuk tombol hari sebelumnya/berikutnya (ikon garis, mewarisi warna teks).
function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={dir === "left" ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Baris kerangka saat data pertama dimuat: tata letak sudah final, setiap
// nilai diganti batang abu seukuran aslinya (tanpa kilau).
// `{ rows = 5 }` = props dengan nilai bawaan 5 bila tidak diisi.
// Array.from({ length: rows }, ...) membuat array sepanjang `rows` lalu
// memetakannya menjadi <tr>. aria-hidden menyembunyikannya dari pembaca layar
// (mereka mendengar "Memuat…" saja).
function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i}>
          <td className="bk__c-time">
            <span className="bk__bar" style={{ width: 40, marginLeft: "auto" }} />
          </td>
          <td className="bk__c-name">
            <span className="bk__bar" style={{ width: 140 }} />
            <span className="bk__bar" style={{ width: 100, marginTop: 8 }} />
          </td>
          <td className="bk__c-doc">
            <span className="bk__bar" style={{ width: 120 }} />
          </td>
          <td className="bk__c-reason">
            <span className="bk__bar" style={{ width: 130 }} />
          </td>
          <td className="bk__c-status">
            <span className="bk__bar" style={{ width: 84 }} />
          </td>
          <td className="bk__c-act" />
        </tr>
      ))}
    </tbody>
  );
}

// Kepala tabel, dipakai saat memuat maupun saat data sudah ada, supaya kolom
// tidak bergeser. Kolom aksi tidak punya judul yang terlihat; "Aksi" tetap ada
// untuk pembaca layar lewat kelas sr-only-text.
function TableHead() {
  return (
    <thead>
      <tr>
        <th scope="col" className="bk__c-time">
          Jam
        </th>
        <th scope="col">Pasien</th>
        <th scope="col">Dokter</th>
        <th scope="col" className="bk__c-reason">
          Alasan kunjungan
        </th>
        <th scope="col">Status</th>
        <th scope="col">
          <span className="sr-only-text">Aksi</span>
        </th>
      </tr>
    </thead>
  );
}

// ---------------------------------------------------------------------------
// Tahap 1: memuat data dasar (user + dokter)
// ---------------------------------------------------------------------------
// `export default` = komponen utama file ini. Next.js memakainya sebagai isi
// rute /bookings karena file ini bernama app/bookings/page.tsx.
export default function BookingsPage() {
  const router = useRouter();
  // Satu state dengan tiga kemungkinan bentuk; `kind` menentukan isinya.
  // Tanda `|` berarti "salah satu dari": memuat, error (dengan pesan), atau
  // siap (dengan data). TypeScript memastikan kita tidak membaca `clinic`
  // sebelum `kind` bernilai "ready".
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; me: Me; clinic: Clinic; practitioners: Practitioner[] }
  >({ kind: "loading" });

  // Efek ini berjalan sekali setelah halaman pertama kali tampil (dependensinya
  // hanya `router`, yang tidak berubah).
  useEffect(() => {
    // `alive` mencegah memperbarui state setelah halaman ditinggalkan.
    // Fungsi yang dikembalikan di bagian bawah (`return () => {...}`) adalah
    // "pembersih": React memanggilnya saat komponen dilepas.
    let alive = true;
    // Dua permintaan dijalankan bersamaan; hasilnya datang bersama-sama.
    // Promise.all menunggu keduanya; bila salah satu gagal, langsung ke .catch.
    // `([me, practitioners])` membongkar array hasil jadi dua variabel.
    Promise.all([api<Me>("/user"), fetchPractitioners()])
      .then(([me, practitioners]) => {
        if (!alive) return;
        if (!me.clinic) {
          setState({ kind: "error", message: "Akun ini belum terhubung ke klinik." });
          return;
        }
        setState({ kind: "ready", me, clinic: me.clinic, practitioners });
      })
      .catch((err) => {
        if (!alive) return;
        // 401 = belum login / sesi habis -> ke halaman masuk.
        // 403 = login, tetapi middleware has.clinic menolak (akun tanpa klinik).
        // Selain itu (server mati, jaringan putus) -> pesan umum.
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        } else if (err instanceof ApiError && err.status === 403) {
          setState({ kind: "error", message: "Akun ini belum terhubung ke klinik." });
        } else {
          setState({
            kind: "error",
            message: "Tidak bisa memuat halaman. Pastikan Laravel berjalan, lalu muat ulang.",
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [router]);

  // Belum siap: tampilkan judul + kerangka (saat memuat) atau pesan error.
  // `a ? b : c` di JSX artinya "jika a tampilkan b, kalau tidak tampilkan c".
  // `<>...</>` (Fragment) membungkus beberapa elemen tanpa menambah tag HTML.
  if (state.kind !== "ready") {
    return (
      <Shell>
        <h1 className="bk__h1">Booking</h1>
        {state.kind === "error" ? (
          <p role="alert" className="bk__error">
            {state.message}
          </p>
        ) : (
          <>
            <p className="sr-only-text" aria-live="polite">
              Memuat…
            </p>
            <table className="bk__table">
              <TableHead />
              <SkeletonRows />
            </table>
          </>
        )}
      </Shell>
    );
  }
  // Siap: zona waktu klinik dan daftar dokter diteruskan sebagai props ke
  // BookingsView. Dengan dipisah begini, BookingsView tidak perlu memikirkan
  // keadaan "belum ada klinik" sama sekali.
  return (
    <Shell clinicName={state.clinic.name} userName={state.me.user.name}>
      <BookingsView clinic={state.clinic} practitioners={state.practitioners} />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Tahap 2-4: daftar booking, filter, dan aksi
// ---------------------------------------------------------------------------
function BookingsView({
  clinic,
  practitioners,
}: {
  clinic: Clinic;
  practitioners: Practitioner[];
}) {
  const router = useRouter();
  const tz = clinic.timezone;

  // Filter yang sedang aktif. Nilai awal: hari ini menurut zona waktu KLINIK.
  // useState mengembalikan pasangan [nilai, pengubahnya]. Nilai awal ditulis
  // sebagai fungsi `() => ({...})` supaya todayIn() hanya dihitung sekali,
  // bukan di setiap render.
  const [filters, setFilters] = useState<BookingFilters>(() => ({
    date: todayIn(tz),
    status: "",
    practitionerId: "",
    page: 1,
  }));
  // Dinaikkan 1 setiap kali daftar perlu dimuat ulang (setelah aksi / "Coba lagi").
  const [reloadKey, setReloadKey] = useState(0);
  // Hasil pengambilan terakhir. `key` mencatat untuk filter mana hasil ini.
  const [result, setResult] = useState<{
    key: string;
    data?: Paginated<Booking>;
    at?: number; // waktu data diambil (ms), dasar untuk "pasien berikutnya"
    error?: string;
  } | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null); // baris yang menunggu konfirmasi batal
  const [busyId, setBusyId] = useState<number | null>(null); // baris yang sedang diproses
  const [actionError, setActionError] = useState<string | null>(null);
  // Penjaga klik ganda. Kenapa useRef, bukan state? Perubahan state baru
  // terlihat di render berikutnya, jadi dua klik super cepat bisa sama-sama
  // lolos. Ref berubah seketika, sehingga klik kedua langsung tertahan.
  const busyRef = useRef(false);

  // Kunci permintaan = filter + penghitung muat-ulang. Kalau hasil yang
  // tersimpan bukan untuk kunci ini, berarti data sedang dimuat.
  // Dengan cara ini "sedang memuat" tidak perlu state terpisah: ia dihitung
  // dari perbandingan kunci (dan aturan React 19 melarang mengubah state
  // langsung di dalam useEffect).
  const key = `${JSON.stringify(filters)}#${reloadKey}`;
  const current = result?.key === key ? result : null;
  const loading = current === null;
  const data = current?.error ? undefined : result?.data; // data lama tetap tampil selama memuat
  const today = todayIn(tz);
  const isToday = filters.date === today;
  const filtered = filters.status !== "" || filters.practitionerId !== "";

  // Pasien berikutnya: booking terkonfirmasi pertama yang jamnya belum lewat
  // (dihitung dari waktu data diambil), hanya bila yang dilihat adalah hari ini.
  // Baris sudah urut jam dari Laravel.
  const fetchedAt = result?.at ?? 0;
  const next =
    isToday && data
      ? data.data.find(
          (b) => b.status === "confirmed" && new Date(b.booked_time).getTime() >= fetchedAt,
        )
      : undefined;

  // Pengambilan daftar booking. Dependensinya [filters, key, router]: setiap
  // kali filter berubah atau reloadKey naik (key ikut berubah), efek ini jalan lagi.
  useEffect(() => {
    // Setiap kali filter berubah, efek ini berjalan lagi dan efek sebelumnya
    // dibersihkan (alive = false). Jadi respons lama yang datang terlambat
    // diabaikan dan tidak menimpa respons terbaru.
    let alive = true;
    fetchBookings(filters)
      .then((page) => {
        if (!alive) return;
        // Halaman ini kosong karena baris terakhirnya baru saja berubah status
        // (atau keluar dari filter): mundur ke halaman yang masih ada.
        if (page.data.length === 0 && filters.page > 1) {
          setFilters((f) => ({ ...f, page: Math.max(1, Math.min(f.page - 1, page.last_page)) }));
          return;
        }
        setResult({ key, data: page, at: Date.now() });
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setResult({ key, error: "Tidak bisa memuat booking. Periksa koneksi, lalu coba lagi." });
      });
    return () => {
      alive = false;
    };
  }, [filters, key, router]);

  // Mengubah filter selalu kembali ke halaman 1 (kecuali yang diubah memang halaman).
  // `Partial<BookingFilters>` = objek berisi sebagian field saja, contoh
  // change({ status: "completed" }). `{ ...f, ...patch }` menyalin filter lama
  // lalu menimpa field yang ada di `patch`. `patch.page ?? 1` berarti "pakai
  // patch.page bila ada, kalau tidak 1". setFilters menerima fungsi (f) => ...
  // supaya selalu memakai nilai filter terbaru.
  function change(patch: Partial<BookingFilters>) {
    setConfirmId(null);
    setActionError(null);
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  }

  // Menjalankan aksi pada satu booking. Hanya satu aksi pada satu waktu.
  // `action` adalah fungsi yang memanggil API, contoh () => markCompleted(id).
  // Alurnya: kunci (busyRef + busyId) -> tunggu API (`await`) -> bila sukses,
  // tutup konfirmasi dan naikkan reloadKey agar daftar dimuat ulang -> bila
  // gagal, tampilkan pesan -> `finally` selalu membuka kunci, sukses atau gagal.
  async function run(id: number, action: () => Promise<unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(id);
    setActionError(null);
    try {
      await action();
      setConfirmId(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
      } else if (err instanceof ApiError && err.status === 403) {
        setActionError("Booking ini bukan milik klinik Anda.");
      } else {
        setActionError("Gagal memperbarui booking. Coba lagi.");
      }
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  // Ringkasan hari itu ("6 terkonfirmasi · 2 selesai · 1 dibatalkan"). Hanya
  // dihitung bila semua booking ada di halaman ini dan tidak disaring status,
  // supaya angkanya benar-benar dari baris yang tampil.
  const summary =
    data && data.last_page === 1 && filters.status === "" && data.data.length > 0
      ? STATUS_OPTIONS.map((s) => [s, data.data.filter((b) => b.status === s).length] as const)
          .filter(([, n]) => n > 0)
          .map(([s, n]) => `${n} ${STATUS_LABEL[s].toLowerCase()}`)
      : null;

  // Semua tombol aksi nonaktif selama daftar dimuat atau ada aksi berjalan.
  const disabled = loading || busyId !== null;
  // Rentang baris untuk paginasi, contoh halaman 2 berisi 21–40.
  const from = data ? (data.current_page - 1) * PER_PAGE + 1 : 0;
  const to = data ? from + data.data.length - 1 : 0;

  // Susunan tampilan (dari atas ke bawah):
  //  1. Baris judul: judul, tanggal + ringkasan, pasien berikutnya | navigasi tanggal.
  //  2. Tab status.
  //  3. Toolbar: pilihan dokter | jumlah booking.
  //  4. Isi: error, kosong, atau tabel (kerangka saat memuat) + paginasi.
  // Di JSX, `{kondisi && <X />}` berarti "tampilkan X hanya bila kondisi benar",
  // dan `.map(...)` mengubah setiap data menjadi elemen; `key` wajib unik
  // supaya React tahu baris mana yang berubah.
  return (
    <>
      <div className="bk__titlerow">
        <div>
          <h1 className="bk__h1">Booking</h1>
          <p className="bk__sub">
            <span className="bk__nowrap">{longDate(filters.date)}</span>
            {/* Pemisah di luar span supaya baris boleh patah di antara bagian. */}
            {summary?.map((part) => (
              <Fragment key={part}>
                {" · "}
                <span className="bk__nowrap">{part}</span>
              </Fragment>
            ))}
          </p>
          {next && (
            <p className="bk__next">
              <span>
                Berikutnya <b>{formatDate(next.booked_time, tz)}</b> · {next.patient_name},{" "}
                {next.practitioner.name}
              </span>
            </p>
          )}
        </div>

        {/* Navigasi tanggal. Tombol ikon tidak punya teks, jadi aria-label
            memberi namanya untuk pembaca layar. Input tanggal mengirim ""
            saat dikosongkan; `e.target.value && ...` mengabaikan nilai kosong.
            "Hari ini" nonaktif bila tanggal yang dilihat sudah hari ini. */}
        <div className="bk__daynav">
          <button
            type="button"
            className="bk__ctl bk__ctl--icon"
            aria-label="Hari sebelumnya"
            onClick={() => change({ date: shiftDate(filters.date, -1) })}
          >
            <Chevron dir="left" />
          </button>
          <input
            type="date"
            aria-label="Tanggal booking"
            className="bk__ctl"
            value={filters.date}
            onChange={(e) => e.target.value && change({ date: e.target.value })}
          />
          <button
            type="button"
            className="bk__ctl bk__ctl--icon"
            aria-label="Hari berikutnya"
            onClick={() => change({ date: shiftDate(filters.date, 1) })}
          >
            <Chevron dir="right" />
          </button>
          <button
            type="button"
            className="bk__ctl"
            disabled={isToday}
            onClick={() => change({ date: today })}
          >
            Hari ini
          </button>
        </div>
      </div>

      {/* Tab status: garis bawah aksen pada tab yang aktif. aria-pressed
          (true/false) menandai tab terpilih, dan CSS memakai atribut yang sama
          untuk menggambar garisnya, jadi tampilan dan aksesibilitas selalu cocok. */}
      <div className="bk__tabs" role="group" aria-label="Status booking">
        {STATUS_FILTERS.map((o) => (
          <button
            key={o.value || "all"}
            type="button"
            className="bk__tab"
            aria-pressed={filters.status === o.value}
            onClick={() => change({ status: o.value })}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Pilihan dokter. Nilai <option> selalu string, makanya practitionerId
          disimpan sebagai string ("" = semua dokter). */}
      <div className="bk__toolbar">
        <select
          aria-label="Dokter"
          className="bk__ctl"
          value={filters.practitionerId}
          onChange={(e) => change({ practitionerId: e.target.value })}
        >
          <option value="">Semua dokter</option>
          {practitioners.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
        {data && <p className="bk__count">{data.total} booking</p>}
      </div>

      {/* Pesan gagal aksi. Elemen selalu ada (hanya disembunyikan) supaya
          role="alert" langsung dibacakan saat pesannya muncul. */}
      <p role="alert" className="bk__alert" hidden={!actionError}>
        {actionError}
      </p>

      {/* Isi utama, satu dari tiga: error -> kosong -> tabel. `current?.error`
          (tanda ?. = aman bila current null) dicek dulu. */}
      {current?.error ? (
        <div className="bk__error" role="alert">
          <span>{current.error}</span>
          <button type="button" className="bk__textbtn" onClick={() => setReloadKey((k) => k + 1)}>
            Coba lagi
          </button>
        </div>
      ) : data && data.data.length === 0 ? (
        <p className="bk__empty">
          {filtered
            ? "Tidak ada booking yang cocok dengan filter ini."
            : `Tidak ada booking pada ${longDate(filters.date)}.`}
        </p>
      ) : (
        <>
          <table className="bk__table">
            <caption className="sr-only-text">Daftar booking {longDate(filters.date)}</caption>
            <TableHead />
            {/* Belum pernah ada data -> kerangka. Sudah ada data tetapi sedang
                memuat ulang -> data lama tetap tampil, diredupkan (is-busy). */}
            {!data ? (
              <SkeletonRows />
            ) : (
              <tbody className={loading ? "is-busy" : undefined} aria-busy={loading}>
                {data.data.map((b) => (
                  <tr key={b.id} className={b.id === next?.id ? "is-next" : undefined}>
                    <td className="bk__c-time">
                      {formatDate(b.booked_time, tz)}
                      {b.id === next?.id && <span className="bk__nexttag">Berikutnya</span>}
                    </td>
                    <td className="bk__c-name">
                      <strong>{b.patient_name}</strong>
                      <span className="bk__phone">{formatPhone(b.patient_phone)}</span>
                    </td>
                    {/* Alasan ditulis dua kali: sebagai baris kedua di sel dokter
                        (tampil di tablet) dan sebagai kolom sendiri (desktop).
                        CSS memilih mana yang terlihat sesuai lebar layar. */}
                    <td className="bk__c-doc">
                      {b.practitioner.name}
                      <span className="bk__reason-sub">{b.visit_reason}</span>
                    </td>
                    <td className="bk__c-reason">{b.visit_reason}</td>
                    <td className="bk__c-status">
                      <span className={`bk__pill bk__pill--${b.status}`}>
                        {STATUS_LABEL[b.status]}
                      </span>
                    </td>
                    {/* Aksi, tiga kemungkinan: bukan "confirmed" -> kosong;
                        baris ini sedang dikonfirmasi -> "Batalkan booking ini?";
                        selain itu -> tombol Selesai + Batal. `key` yang berbeda
                        ("ask"/"idle") membuat React membuat elemen baru, sehingga
                        animasi masuk konfirmasi diputar. */}
                    <td className="bk__c-act">
                      {b.status !== "confirmed" ? null : confirmId === b.id ? (
                        // Konfirmasi batal: muncul halus (kelas --ask), dua pilihan jelas.
                        <div key="ask" className="bk__actions bk__actions--ask">
                          <span className="bk__ask">Batalkan booking ini?</span>
                          <button
                            type="button"
                            className="bk__ctl bk__ctl--sm bk__ctl--dark"
                            disabled={disabled}
                            onClick={() => run(b.id, () => cancelBooking(b.id))}
                          >
                            Ya, batalkan
                          </button>
                          <button
                            type="button"
                            className="bk__textbtn"
                            disabled={disabled}
                            onClick={() => setConfirmId(null)}
                          >
                            Tidak
                          </button>
                        </div>
                      ) : (
                        <div key="idle" className="bk__actions">
                          <button
                            type="button"
                            className="bk__ctl bk__ctl--sm"
                            disabled={disabled}
                            aria-label={`Tandai selesai: ${b.patient_name}`}
                            onClick={() => run(b.id, () => markCompleted(b.id))}
                          >
                            Selesai
                          </button>
                          <button
                            type="button"
                            className="bk__textbtn"
                            disabled={disabled}
                            aria-label={`Batalkan booking ${b.patient_name}`}
                            onClick={() => setConfirmId(b.id)}
                          >
                            Batal
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>

          {/* Paginasi hanya muncul bila lebih dari satu halaman (> 20 booking). */}
          {data && data.last_page > 1 && (
            <nav className="bk__pager" aria-label="Halaman daftar booking">
              <span>
                {from}–{to} dari {data.total}
              </span>
              <div>
                <button
                  type="button"
                  className="bk__ctl bk__ctl--icon"
                  aria-label="Halaman sebelumnya"
                  disabled={loading || data.current_page <= 1}
                  onClick={() => change({ page: data.current_page - 1 })}
                >
                  <Chevron dir="left" />
                </button>
                <button
                  type="button"
                  className="bk__ctl bk__ctl--icon"
                  aria-label="Halaman berikutnya"
                  disabled={loading || data.current_page >= data.last_page}
                  onClick={() => change({ page: data.current_page + 1 })}
                >
                  <Chevron dir="right" />
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </>
  );
}
