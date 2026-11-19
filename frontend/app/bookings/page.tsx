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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { LogoMark } from "@/components/Logo";
import { ApiError, api } from "@/lib/api";
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

type Clinic = { id: number; name: string; timezone: string };
type Me = {
  user: { id: number; name: string; email: string };
  clinic: Clinic | null;
};

const PER_PAGE = 20; // sama dengan paginate(20) di Laravel
const STATUS_OPTIONS: BookingStatus[] = ["confirmed", "completed", "cancelled"];

// Pilihan tab status: "Semua" + tiga status.
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

// Bingkai aplikasi: top bar di atas bingkai batu, isi di satu lembar putih.
function Shell({
  clinicName,
  userName,
  children,
}: {
  clinicName?: string;
  userName?: string;
  children: ReactNode;
}) {
  return (
    <div className="bk">
      <header className="bk__top">
        <Link href="/" aria-label="Praktika, ke beranda" className="bk__brand">
          <LogoMark size={26} />
        </Link>
        <span className="bk__scope">{clinicName ?? "Praktika"}</span>
        <nav className="bk__nav" aria-label="Utama">
          <Link href="/bookings" aria-current="page" className="bk__navlink">
            Booking
          </Link>
          <Link href="/akun" className="bk__navlink">
            Akun
          </Link>
        </nav>
        {userName && <span className="bk__user">{userName}</span>}
      </header>
      <main className="bk__sheet">
        <div className="bk__inner">{children}</div>
      </main>
    </div>
  );
}

// Baris kerangka saat data pertama dimuat: tata letak sudah final, setiap
// nilai diganti batang abu seukuran aslinya (tanpa kilau).
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
export default function BookingsPage() {
  const router = useRouter();
  // Satu state dengan tiga kemungkinan bentuk; `kind` menentukan isinya.
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; me: Me; clinic: Clinic; practitioners: Practitioner[] }
  >({ kind: "loading" });

  useEffect(() => {
    // `alive` mencegah memperbarui state setelah halaman ditinggalkan.
    let alive = true;
    // Dua permintaan dijalankan bersamaan; hasilnya datang bersama-sama.
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
  const busyRef = useRef(false); // penjaga klik ganda yang berlaku seketika

  // Kunci permintaan = filter + penghitung muat-ulang. Kalau hasil yang
  // tersimpan bukan untuk kunci ini, berarti data sedang dimuat.
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
  function change(patch: Partial<BookingFilters>) {
    setConfirmId(null);
    setActionError(null);
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  }

  // Menjalankan aksi pada satu booking. Hanya satu aksi pada satu waktu.
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

  const disabled = loading || busyId !== null;
  const from = data ? (data.current_page - 1) * PER_PAGE + 1 : 0;
  const to = data ? from + data.data.length - 1 : 0;

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

      {/* Tab status: garis bawah aksen pada tab yang aktif. */}
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

      <p role="alert" className="bk__alert" hidden={!actionError}>
        {actionError}
      </p>

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
