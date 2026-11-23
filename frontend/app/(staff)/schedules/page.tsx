"use client";

// Halaman Jadwal praktek (Task 12, menggantikan halaman Inertia Schedules/Edit).
//
// Alur singkat:
//  1. SchedulesPage memuat /api/user (zona dan nama klinik) dan daftar dokter.
//  2. ScheduleView memuat jadwal mingguan SATU dokter terpilih dan menampilkannya
//     sebagai 7 baris (Senin..Minggu): aktif/libur, jam mulai, jam selesai.
//  3. "Simpan jadwal" memeriksa setiap hari, lalu mengirim seminggu sekaligus
//     (hari yang tidak dikirim = libur). Balasan memuat pasien confirmed mendatang
//     yang kini di luar jam praktek; panel di samping menampilkan mereka dengan
//     tombol WhatsApp. Booking TIDAK diubah; staf yang memutuskan.
//  4. Pindah dokter saat ada perubahan belum disimpan -> konfirmasi dua langkah.
//
// Pertanyaan yang dijawab layar ini: "Dokter ini praktek kapan saja, dan siapa
// yang terdampak bila jamnya saya ubah?"
//
// Pola kodenya sama dengan /blocked-times: "sedang memuat" dihitung dari kunci
// permintaan, respons lama diabaikan, klik ganda ditahan useRef. Jam di sini
// adalah jam LOKAL klinik, jadi tidak ada konversi zona. Fungsi murni ada di
// lib/schedule.ts dan sudah dites.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Shell } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";
import { waLink } from "@/lib/blocked";
import { formatDate, type Practitioner } from "@/lib/booking";
import { fetchPractitioners } from "@/lib/booking-api";
import { TIMEZONES } from "@/lib/clinic";
import type { Clinic, Me } from "@/lib/me";
import {
  DAYS,
  buildWeek,
  copyHoursToActive,
  dayLabel,
  isWeekDirty,
  rowErrorsFrom422,
  scheduleChangeMessage,
  slotCount,
  toMinutes,
  toPayload,
  validateDay,
  type DayState,
  type SaveWeekResponse,
  type ScheduleRow,
} from "@/lib/schedule";
import { fetchWeek, saveWeek } from "@/lib/schedule-api";

// "2030-01-07T02:00:00Z" -> "Sen 7 Jan, 09.00" menurut zona klinik (panel terdampak).
function whenLabel(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  const day = new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
  return `${day}, ${formatDate(iso, tz)}`;
}

function tzShort(tz: string): string {
  return TIMEZONES.find((t) => t.value === tz)?.label.split(",")[0] ?? tz;
}

// ---------------------------------------------------------------------------
// Tahap 1: memuat data dasar (user + dokter)
// ---------------------------------------------------------------------------
export default function SchedulesPage() {
  const router = useRouter();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; me: Me; clinic: Clinic; practitioners: Practitioner[] }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
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
        <h1 className="bk__h1">Jadwal praktek</h1>
        {state.kind === "error" ? (
          <p role="alert" className="bk__error">
            {state.message}
          </p>
        ) : (
          <>
            <p className="sr-only-text" aria-live="polite">
              Memuat…
            </p>
            <div className="bk__schedgrid">
              <div className="bk__form">
                <SkeletonDays />
              </div>
            </div>
          </>
        )}
      </Shell>
    );
  }

  if (state.practitioners.length === 0) {
    return (
      <Shell clinicName={state.clinic.name} userName={state.me.user.name}>
        <h1 className="bk__h1">Jadwal praktek</h1>
        <p className="bk__empty">
          Klinik ini belum punya dokter.{" "}
          <Link href="/akun" className="bk__textlink">
            Tambah dokter di halaman Akun →
          </Link>
        </p>
      </Shell>
    );
  }

  return (
    <Shell clinicName={state.clinic.name} userName={state.me.user.name}>
      <ScheduleView clinic={state.clinic} practitioners={state.practitioners} />
    </Shell>
  );
}

function SkeletonDays() {
  return (
    <ul className="bk__days" aria-hidden="true">
      {DAYS.map((d) => (
        <li key={d.dow} className="bk__day">
          <span className="bk__bar" style={{ width: 72 }} />
          <span className="bk__bar" style={{ width: 180 }} />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Tahap 2-4: pilih dokter, form 7 hari, simpan, panel terdampak
// ---------------------------------------------------------------------------
function ScheduleView({ clinic, practitioners }: { clinic: Clinic; practitioners: Practitioner[] }) {
  const router = useRouter();
  const tz = clinic.timezone;

  const [practitionerId, setPractitionerId] = useState(practitioners[0].id);
  // Dokter yang ingin dipilih saat masih ada perubahan (menunggu konfirmasi).
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Hasil pengambilan terakhir; `key` = untuk permintaan mana.
  const [result, setResult] = useState<{ key: string; saved?: ScheduleRow[]; error?: string } | null>(null);
  const [week, setWeek] = useState<DayState[]>(() => buildWeek([]));

  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savingRef = useRef(false);
  // Balasan simpan terakhir (panel pasien terdampak), dengan nama dokternya.
  const [saved, setSaved] = useState<{ res: SaveWeekResponse; doctor: string } | null>(null);

  const key = `${practitionerId}#${reloadKey}`;
  const current = result?.key === key ? result : null;
  const loading = current === null;
  const loadError = current?.error;
  const savedRows = current?.saved;
  const dirty = savedRows !== undefined && isWeekDirty(savedRows, week);
  const doctorName = practitioners.find((p) => p.id === practitionerId)?.name ?? "dokter ini";

  useEffect(() => {
    let alive = true;
    fetchWeek(practitionerId)
      .then((res) => {
        if (!alive) return;
        setResult({ key, saved: res.schedules });
        setWeek(buildWeek(res.schedules));
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        const message =
          err instanceof ApiError && err.status === 403
            ? "Dokter ini bukan milik klinik Anda."
            : "Tidak bisa memuat jadwal. Periksa koneksi, lalu coba lagi.";
        setResult({ key, error: message });
      });
    return () => {
      alive = false;
    };
  }, [practitionerId, key, router]);

  function switchTo(id: number) {
    setPractitionerId(id);
    setPendingId(null);
    setRowErrors({});
    setFormError(null);
    setJustSaved(false);
    setSaved(null);
  }

  function requestSwitch(id: number) {
    if (id === practitionerId) return;
    if (dirty) setPendingId(id);
    else switchTo(id);
  }

  function updateDay(dow: number, patch: Partial<DayState>) {
    setWeek((w) => w.map((d) => (d.dow === dow ? { ...d, ...patch } : d)));
    setRowErrors((e) => {
      if (!e[dow]) return e;
      const next = { ...e };
      delete next[dow];
      return next;
    });
    setFormError(null);
    setJustSaved(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (savingRef.current || !dirty) return;
    const local: Record<number, string> = {};
    for (const d of week) {
      const msg = validateDay(d);
      if (msg) local[d.dow] = msg;
    }
    if (Object.keys(local).length > 0) {
      setRowErrors(local);
      setFormError("Periksa hari yang ditandai.");
      return;
    }
    const payload = toPayload(week).schedules;
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const res = await saveWeek(practitionerId, payload);
      setResult({ key, saved: res.schedules });
      setWeek(buildWeek(res.schedules));
      setSaved({ res, doctor: doctorName });
      setRowErrors({});
      setJustSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
      } else if (err instanceof ApiError && err.status === 403) {
        setFormError("Dokter ini bukan milik klinik Anda.");
      } else if (err instanceof ApiError && err.status === 422) {
        setRowErrors(rowErrorsFrom422(err.body, payload));
        setFormError("Periksa hari yang ditandai.");
      } else {
        setFormError("Gagal menyimpan jadwal. Coba lagi.");
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const active = week.filter((d) => d.working);
  const firstActive = active[0];
  const totalSlots = week.reduce((n, d) => n + slotCount(d), 0);
  const moreOutside = saved ? saved.res.outside_bookings - saved.res.outside.length : 0;
  const pendingName = practitioners.find((p) => p.id === pendingId)?.name;

  return (
    <>
      <div className="bk__titlerow">
        <div>
          <h1 className="bk__h1">Jadwal praktek</h1>
          <p className="bk__sub">
            Jam praktek mingguan tiap dokter. Jam mengikuti zona waktu klinik ({tzShort(tz)}).
          </p>
        </div>
        <div className="bk__switch">
          <select
            aria-label="Dokter"
            className="bk__ctl"
            value={practitionerId}
            disabled={saving}
            onChange={(e) => requestSwitch(Number(e.target.value))}
          >
            {practitioners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {pendingId !== null && (
            <div className="bk__actions bk__actions--ask" role="alert">
              <span className="bk__ask">Buang perubahan untuk {doctorName}?</span>
              <button
                type="button"
                className="bk__ctl bk__ctl--sm bk__ctl--dark"
                aria-label={`Buang perubahan dan buka ${pendingName}`}
                onClick={() => switchTo(pendingId)}
              >
                Ya, buang
              </button>
              <button type="button" className="bk__textbtn" onClick={() => setPendingId(null)}>
                Tidak
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bk__schedgrid">
        <section aria-labelledby="week-title">
          {loadError ? (
            <div className="bk__error" role="alert">
              <span>{loadError}</span>
              <button type="button" className="bk__textbtn" onClick={() => setReloadKey((k) => k + 1)}>
                Coba lagi
              </button>
            </div>
          ) : (
            <form className="bk__form" onSubmit={submit} noValidate aria-busy={loading}>
              <div className="bk__formhead">
                <h2 id="week-title" className="bk__h2">
                  {doctorName}
                </h2>
                {!loading && (
                  <span className="bk__muted bk__nums">
                    {active.length} hari · {totalSlots} slot per minggu
                  </span>
                )}
              </div>

              {loading ? (
                <>
                  <p className="sr-only-text" aria-live="polite">
                    Memuat jadwal…
                  </p>
                  <SkeletonDays />
                </>
              ) : (
                <ul className="bk__days" aria-label={`Jadwal mingguan ${doctorName}`}>
                  {week.map((d) => (
                    <DayRow key={d.dow} day={d} error={rowErrors[d.dow]} onChange={(p) => updateDay(d.dow, p)} />
                  ))}
                </ul>
              )}

              <p role="alert" className="bk__alert" hidden={!formError}>
                {formError}
              </p>
              <div className="bk__formfoot">
                <button type="submit" className="bk__ctl bk__ctl--dark" disabled={loading || saving || !dirty}>
                  {saving ? "Menyimpan…" : "Simpan jadwal"}
                </button>
                {active.length > 1 && firstActive && (
                  <button
                    type="button"
                    className="bk__textbtn"
                    disabled={loading || saving}
                    onClick={() => {
                      setWeek((w) => copyHoursToActive(w, firstActive.dow));
                      setRowErrors({});
                      setJustSaved(false);
                    }}
                  >
                    Samakan jam {dayLabel(firstActive.dow)} ke semua hari aktif
                  </button>
                )}
                <span role="status" className="bk__muted">
                  {justSaved && !dirty ? "Tersimpan" : ""}
                </span>
              </div>
            </form>
          )}
        </section>

        {/* Panel hasil simpan. Wadah role="status" selalu ada; isinya muncul setelah simpan. */}
        <div role="status" aria-live="polite" className="bk__schedside">
          {!saved && (
            <div className="bk__schedhint">
              <p>
                <b>Setelah disimpan,</b> pasien yang sudah booking di luar jam baru muncul di sini dengan
                tombol WhatsApp. Booking mereka tidak diubah.
              </p>
              <p>
                Untuk menutup tanggal tertentu (cuti, rapat), pakai{" "}
                <Link href="/blocked-times" className="bk__textlink">
                  Blokir waktu →
                </Link>
              </p>
            </div>
          )}
          {saved && (
            <section className="bk__conflict">
              {saved.res.outside_bookings === 0 ? (
                <p>
                  <b>Jadwal disimpan.</b> Tidak ada booking yang terdampak.
                </p>
              ) : (
                <>
                  <p>
                    <b>Jadwal disimpan.</b> {saved.res.outside_bookings} pasien sudah booking di luar jam
                    praktek baru {saved.doctor}. Booking mereka tidak diubah; hubungi mereka bila perlu.
                  </p>
                  <ul>
                    {saved.res.outside.map((c) => {
                      const link = waLink(c.patient_phone, scheduleChangeMessage(c, clinic.name, saved.doctor, tz));
                      return (
                        <li key={c.id}>
                          <span>
                            <strong>{c.patient_name}</strong>
                            <span className="bk__phone">{whenLabel(c.booked_time, tz)}</span>
                          </span>
                          {link ? (
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bk__ctl bk__ctl--sm"
                              aria-label={`Hubungi ${c.patient_name} lewat WhatsApp`}
                            >
                              WhatsApp
                            </a>
                          ) : (
                            <span className="bk__muted">Nomor tidak valid</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {moreOutside > 0 && (
                    <p className="bk__muted">dan {moreOutside} lainnya. Lihat selengkapnya di halaman Booking.</p>
                  )}
                  <p>
                    <Link href="/bookings" className="bk__textlink">
                      Buka halaman Booking →
                    </Link>
                  </p>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

// Satu baris hari: centang aktif (labelnya nama hari), jam mulai-selesai,
// jumlah slot, dan bar 00-24 (hiasan; informasinya sudah ada di kolom jam).
function DayRow({
  day,
  error,
  onChange,
}: {
  day: DayState;
  error?: string;
  onChange: (patch: Partial<DayState>) => void;
}) {
  const label = dayLabel(day.dow);
  const errId = `day-${day.dow}-err`;
  const slots = slotCount(day);
  const s = toMinutes(day.start);
  const e = toMinutes(day.end);
  const showBar = day.working && s !== null && e !== null && e > s;
  const invalid = error ? { "aria-invalid": true as const, "aria-describedby": errId } : {};

  return (
    <li className={`bk__day${day.working ? "" : " is-off"}`}>
      <label className="bk__check bk__day-name">
        <input type="checkbox" checked={day.working} onChange={(ev) => onChange({ working: ev.target.checked })} />
        <span>{label}</span>
      </label>

      {day.working ? (
        <div className="bk__day-times">
          <input
            type="time"
            step={1800}
            className="bk__ctl"
            aria-label={`${label}, jam mulai`}
            value={day.start}
            onChange={(ev) => onChange({ start: ev.target.value })}
            {...invalid}
          />
          <span aria-hidden="true">–</span>
          <input
            type="time"
            step={1800}
            className="bk__ctl"
            aria-label={`${label}, jam selesai`}
            value={day.end}
            onChange={(ev) => onChange({ end: ev.target.value })}
            {...invalid}
          />
        </div>
      ) : (
        <span className="bk__day-times bk__muted">Libur</span>
      )}

      <span className="bk__day-slots bk__nums">
        {day.working ? (slots === 0 && !error ? "0 slot" : `${slots} slot`) : ""}
      </span>

      <span className="bk__track" aria-hidden="true">
        {showBar && (
          <span className="bk__track-fill" style={{ left: `${(s / 1440) * 100}%`, width: `${((e - s) / 1440) * 100}%` }} />
        )}
      </span>

      {(error || (day.working && slots === 0 && showBar)) && (
        <p id={errId} className={`bk__note bk__day-note${error ? " bk__note--error" : ""}`}>
          {error ?? "Tidak ada slot 30 menit di rentang ini."}
        </p>
      )}
    </li>
  );
}
