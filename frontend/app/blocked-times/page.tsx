"use client";

// Halaman Blokir waktu (Task 10).
//
// Alur singkat:
//  1. BlockedTimesPage memuat /api/user (butuh zona waktu klinik) dan daftar dokter.
//  2. BlockedTimesView menampilkan form "Buat blokir" dan daftar blokir mendatang
//     untuk SATU dokter terpilih (rute API-nya per dokter).
//  3. "Simpan blokir" memeriksa form (buildBlockRange), mengirim ke Laravel, lalu
//     memuat ulang daftar. Bila ada pasien yang sudah booking di waktu itu, panel
//     di bawah form menampilkan mereka dengan tombol WhatsApp. Booking TIDAK
//     dibatalkan otomatis; staf yang memutuskan.
//  4. "Hapus" (dua langkah, di dalam baris) menghapus blokir, lalu daftar dimuat ulang.
//
// Pertanyaan yang dijawab layar ini: "Dokter ini tidak bisa kapan, dan siapa
// pasien yang perlu saya kabari?"
//
// Pola kodenya sama dengan app/bookings/page.tsx (baca komentar di sana untuk
// penjelasan useState/useEffect/useRef): "sedang memuat" dihitung dari kunci
// permintaan, respons lama diabaikan, dan klik ganda ditahan dengan useRef.
// Kode ini berjalan di BROWSER; data lewat lib/blocked-api.ts -> lib/api.ts.
// Fungsi murni (zona waktu, teks) ada di lib/blocked.ts dan sudah dites.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Shell } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";
import {
  buildBlockRange,
  conflictMessage,
  formatBlockRange,
  waLink,
  type BlockedForm,
  type BlockedTime,
  type CreateBlockedResponse,
} from "@/lib/blocked";
import { createBlock, deleteBlock, fetchBlocks } from "@/lib/blocked-api";
import { formatDate, todayIn, type Paginated, type Practitioner } from "@/lib/booking";
import { fetchPractitioners } from "@/lib/booking-api";
import type { Clinic, Me } from "@/lib/me";

const PER_PAGE = 20; // sama dengan paginate(20) di Laravel

// Form kosong. Kedua tanggal diisi hari ini menurut zona KLINIK (bukan browser).
function emptyForm(tz: string): BlockedForm {
  const today = todayIn(tz);
  return { startDate: today, endDate: today, allDay: false, startTime: "", endTime: "", reason: "" };
}

// Mengambil pesan validasi pertama dari body 422 Laravel:
// { message: "...", errors: { end_time: ["The end time ..."] } } -> pesan pertama.
// `body` bertipe unknown (bisa apa saja), jadi diperiksa selangkah demi selangkah.
function firstValidationMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const errors = (body as { errors?: unknown }).errors;
  if (typeof errors !== "object" || errors === null) return null;
  for (const list of Object.values(errors)) {
    if (Array.isArray(list) && typeof list[0] === "string") return list[0];
  }
  return null;
}

// "2026-11-20T10:30:00Z" -> "20 Nov, 17.30" menurut zona klinik (untuk panel bentrok).
function whenLabel(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const day = new Intl.DateTimeFormat("id-ID", { timeZone: tz, day: "numeric", month: "short" }).format(d);
  return `${day}, ${formatDate(iso, tz)}`;
}

// Kerangka saat daftar pertama dimuat: tata letak sudah final, nilai diganti batang abu.
function SkeletonBlocks({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="bk__block" aria-hidden="true">
          <div className="bk__block-when">
            <span className="bk__bar" style={{ width: 130 }} />
          </div>
          <div className="bk__block-reason">
            <span className="bk__bar" style={{ width: 160 }} />
          </div>
          <div className="bk__block-act" />
        </li>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tahap 1: memuat data dasar (user + dokter)
// ---------------------------------------------------------------------------
export default function BlockedTimesPage() {
  const router = useRouter();
  // Tiga kemungkinan bentuk; `kind` menentukan isinya (sama dengan /bookings).
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; me: Me; clinic: Clinic; practitioners: Practitioner[] }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true; // mencegah memperbarui state setelah halaman ditinggalkan
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
        // 401 = belum login / sesi habis -> halaman masuk. 403 = akun tanpa klinik.
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
      <Shell active="blocked">
        <h1 className="bk__h1">Blokir waktu</h1>
        {state.kind === "error" ? (
          <p role="alert" className="bk__error">
            {state.message}
          </p>
        ) : (
          <p className="sr-only-text" aria-live="polite">
            Memuat…
          </p>
        )}
      </Shell>
    );
  }

  // Klinik tanpa dokter: tidak ada yang bisa diblokir.
  if (state.practitioners.length === 0) {
    return (
      <Shell active="blocked" clinicName={state.clinic.name} userName={state.me.user.name}>
        <h1 className="bk__h1">Blokir waktu</h1>
        <p className="bk__empty">Klinik ini belum punya dokter, jadi belum ada jadwal yang bisa diblokir.</p>
      </Shell>
    );
  }

  return (
    <Shell active="blocked" clinicName={state.clinic.name} userName={state.me.user.name}>
      <BlockedTimesView clinic={state.clinic} practitioners={state.practitioners} />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Tahap 2-4: pilih dokter, form, daftar, hapus, panel bentrok
// ---------------------------------------------------------------------------
function BlockedTimesView({
  clinic,
  practitioners,
}: {
  clinic: Clinic;
  practitioners: Practitioner[]; // dijamin tidak kosong oleh BlockedTimesPage
}) {
  const router = useRouter();
  const tz = clinic.timezone;

  // Dokter terpilih (form dan daftar selalu untuk dokter ini) dan halaman daftar.
  const [practitionerId, setPractitionerId] = useState<number>(practitioners[0].id);
  const [page, setPage] = useState(1);
  // Dinaikkan 1 setiap kali daftar perlu dimuat ulang (setelah simpan/hapus/"Coba lagi").
  const [reloadKey, setReloadKey] = useState(0);
  // Hasil pengambilan terakhir. `key` mencatat untuk permintaan mana, `pid` untuk dokter mana.
  const [result, setResult] = useState<{
    key: string;
    pid: number;
    data?: Paginated<BlockedTime>;
    error?: string;
  } | null>(null);

  // Form dan pengirimannya.
  const [form, setForm] = useState<BlockedForm>(() => emptyForm(tz));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Penjaga klik ganda (lihat penjelasan useRef di /bookings): berubah seketika.
  const submitRef = useRef(false);
  // Balasan simpan terakhir; memicu panel "Blokir disimpan" / daftar pasien bentrok.
  const [created, setCreated] = useState<CreateBlockedResponse | null>(null);

  // Hapus dua langkah di dalam baris.
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const busyRef = useRef(false);

  // "Sedang memuat" dihitung: hasil tersimpan bukan untuk kunci ini = masih memuat.
  const key = `${practitionerId}:${page}#${reloadKey}`;
  const current = result?.key === key ? result : null;
  const loading = current === null;
  // Selama memuat, data lama tetap tampil (diredupkan) HANYA bila milik dokter yang
  // sama. Setelah ganti dokter, daftar dokter lain tidak boleh ikut terlihat.
  const shown = current ?? (result?.pid === practitionerId ? result : null);
  const data = shown?.error ? undefined : shown?.data;
  const loadError = current?.error;
  const doctorName = practitioners.find((p) => p.id === practitionerId)?.name ?? "dokter ini";

  // Pengambilan daftar. Setiap kali dokter/halaman/reloadKey berubah, efek berjalan lagi
  // dan efek sebelumnya dibersihkan (alive = false), jadi respons lama yang datang
  // terlambat diabaikan.
  useEffect(() => {
    let alive = true;
    fetchBlocks(practitionerId, page)
      .then((p) => {
        if (!alive) return;
        // Halaman kosong karena baris terakhirnya baru dihapus: mundur ke halaman yang ada.
        if (p.data.length === 0 && page > 1) {
          setPage((cur) => Math.max(1, Math.min(cur - 1, p.last_page)));
          return;
        }
        setResult({ key, pid: practitionerId, data: p });
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
            : "Tidak bisa memuat blokir. Periksa koneksi, lalu coba lagi.";
        setResult({ key, pid: practitionerId, error: message });
      });
    return () => {
      alive = false;
    };
  }, [practitionerId, page, key, router]);

  // Ganti dokter: kembali ke halaman 1 dan bersihkan sisa tampilan dokter sebelumnya.
  function changePractitioner(id: number) {
    setPractitionerId(id);
    setPage(1);
    setCreated(null);
    setFormError(null);
    setConfirmId(null);
    setActionError(null);
  }

  // Mengubah sebagian isi form. Bila tanggal mulai digeser melewati tanggal selesai,
  // tanggal selesai ikut maju supaya form tidak jatuh ke error (YYYY-MM-DD bisa
  // dibandingkan sebagai teks).
  function updateForm(patch: Partial<BlockedForm>) {
    setFormError(null);
    setForm((f) => {
      const next = { ...f, ...patch };
      if (patch.startDate && next.endDate < next.startDate) next.endDate = next.startDate;
      return next;
    });
  }

  // Simpan blokir. Alur: periksa form -> kirim -> sukses: kosongkan jam dan alasan
  // (tanggal dibiarkan supaya blokir kedua di hari yang sama gampang ditambah),
  // tampilkan panel, muat ulang daftar dari halaman 1.
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitRef.current) return;
    const built = buildBlockRange(form, tz);
    if (!built.ok) {
      setFormError(built.error);
      return;
    }
    submitRef.current = true;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await createBlock(practitionerId, built.value);
      setCreated(res);
      setForm((f) => ({ ...f, startTime: "", endTime: "", reason: "" }));
      setConfirmId(null);
      setActionError(null);
      setPage(1);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
      } else if (err instanceof ApiError && err.status === 403) {
        setFormError("Dokter ini bukan milik klinik Anda.");
      } else if (err instanceof ApiError && err.status === 422) {
        setFormError(firstValidationMessage(err.body) ?? "Data blokir tidak valid.");
      } else {
        setFormError("Gagal menyimpan blokir. Coba lagi.");
      }
    } finally {
      submitRef.current = false;
      setSubmitting(false);
    }
  }

  // Hapus satu blokir. Hanya satu aksi pada satu waktu. Status 404 berarti blokir
  // sudah tidak ada (dihapus dari tab lain / klik ganda): hasilnya sama dengan
  // yang diinginkan, jadi diperlakukan sebagai sukses dan daftar dimuat ulang.
  async function remove(id: number) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(id);
    setActionError(null);
    try {
      await deleteBlock(id);
      setConfirmId(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setConfirmId(null);
        setReloadKey((k) => k + 1);
      } else if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
      } else if (err instanceof ApiError && err.status === 403) {
        setActionError("Blokir ini bukan milik klinik Anda.");
      } else {
        setActionError("Gagal menghapus blokir. Coba lagi.");
      }
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  const disabled = loading || busyId !== null;
  const from = data ? (data.current_page - 1) * PER_PAGE + 1 : 0;
  const to = data ? from + data.data.length - 1 : 0;
  // Pasien bentrok yang tidak muat di daftar (backend membatasi 50).
  const moreConflicts = created ? created.conflicting_bookings - created.conflicts.length : 0;

  // Susunan tampilan (dari atas ke bawah):
  //  1. Judul + pilihan dokter.
  //  2. Form "Buat blokir".
  //  3. Panel hasil simpan (selalu ada di DOM supaya pembaca layar mengumumkan isinya).
  //  4. Daftar blokir mendatang + paginasi.
  return (
    <>
      <div className="bk__titlerow">
        <div>
          <h1 className="bk__h1">Blokir waktu</h1>
          <p className="bk__sub">
            Tutup jadwal dokter untuk cuti, rapat, atau urusan lain. Jam mengikuti zona waktu
            klinik ({tz}).
          </p>
        </div>
        <select
          aria-label="Dokter"
          className="bk__ctl"
          value={practitionerId}
          onChange={(e) => changePractitioner(Number(e.target.value))}
        >
          {practitioners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Form. noValidate: pesan kesalahan kita sendiri (buildBlockRange) yang
          dipakai, bukan gelembung bawaan browser. Setiap kolom punya <label>
          yang terlihat. Kolom jam hilang saat "Seharian" dicentang. */}
      <form className="bk__form" onSubmit={submit} noValidate>
        <h2 className="bk__h2">Buat blokir untuk {doctorName}</h2>
        <div className="bk__fields">
          <label className="bk__field">
            <span>Tanggal mulai</span>
            <input
              type="date"
              className="bk__ctl"
              value={form.startDate}
              onChange={(e) => updateForm({ startDate: e.target.value })}
            />
          </label>
          <label className="bk__field">
            <span>Tanggal selesai</span>
            <input
              type="date"
              className="bk__ctl"
              value={form.endDate}
              onChange={(e) => updateForm({ endDate: e.target.value })}
            />
          </label>
          <label className="bk__check">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(e) => updateForm({ allDay: e.target.checked })}
            />
            <span>Seharian</span>
          </label>
          {!form.allDay && (
            <>
              <label className="bk__field">
                <span>Jam mulai</span>
                <input
                  type="time"
                  className="bk__ctl"
                  value={form.startTime}
                  onChange={(e) => updateForm({ startTime: e.target.value })}
                />
              </label>
              <label className="bk__field">
                <span>Jam selesai</span>
                <input
                  type="time"
                  className="bk__ctl"
                  value={form.endTime}
                  onChange={(e) => updateForm({ endTime: e.target.value })}
                />
              </label>
            </>
          )}
          <label className="bk__field bk__field--wide">
            <span>Alasan</span>
            <input
              type="text"
              className="bk__ctl"
              maxLength={255}
              placeholder="Cuti, rapat, urusan keluarga…"
              value={form.reason}
              onChange={(e) => updateForm({ reason: e.target.value })}
            />
          </label>
        </div>
        {/* Selalu ada (hanya disembunyikan) supaya role="alert" langsung dibacakan. */}
        <p role="alert" className="bk__alert" hidden={!formError}>
          {formError}
        </p>
        <button type="submit" className="bk__ctl bk__ctl--dark bk__submit" disabled={submitting}>
          {submitting ? "Menyimpan…" : "Simpan blokir"}
        </button>
      </form>

      {/* Panel hasil simpan. Wadah role="status" selalu ada; isinya muncul setelah simpan.
          Bila ada pasien bentrok: daftar dengan tombol WhatsApp (tab baru, pesan
          sudah terisi, TIDAK terkirim otomatis). Nomor tak masuk akal -> keterangan. */}
      <div role="status" aria-live="polite">
        {created && (
          <section className="bk__conflict">
            {created.conflicting_bookings === 0 ? (
              <p>
                <b>Blokir disimpan.</b> Tidak ada booking yang bentrok.
              </p>
            ) : (
              <>
                <p>
                  <b>Blokir disimpan.</b> {created.conflicting_bookings} pasien sudah booking di
                  waktu ini. Booking mereka tidak diubah; hubungi mereka bila perlu.
                </p>
                <ul>
                  {created.conflicts.map((c) => {
                    const link = waLink(c.patient_phone, conflictMessage(c, clinic.name, tz));
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
                {moreConflicts > 0 && (
                  <p className="bk__muted">
                    dan {moreConflicts} lainnya. Lihat selengkapnya di halaman Booking.
                  </p>
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

      <h2 className="bk__h2">Blokir mendatang · {doctorName}</h2>

      <p role="alert" className="bk__alert" hidden={!actionError}>
        {actionError}
      </p>

      {/* Isi daftar, satu dari tiga: error -> kosong -> daftar (kerangka saat memuat). */}
      {loadError ? (
        <div className="bk__error" role="alert">
          <span>{loadError}</span>
          <button type="button" className="bk__textbtn" onClick={() => setReloadKey((k) => k + 1)}>
            Coba lagi
          </button>
        </div>
      ) : data && data.data.length === 0 ? (
        <p className="bk__empty">Belum ada blokir mendatang untuk {doctorName}.</p>
      ) : (
        <>
          {!data && (
            <p className="sr-only-text" aria-live="polite">
              Memuat…
            </p>
          )}
          <ul
            className={`bk__blocklist${loading && data ? " is-busy" : ""}`}
            aria-busy={loading}
            aria-label={`Blokir mendatang ${doctorName}`}
          >
            {!data ? (
              <SkeletonBlocks />
            ) : (
              data.data.map((b) => {
                const when = formatBlockRange(b.start_time, b.end_time, tz);
                return (
                  <li key={b.id} className="bk__block">
                    <div className="bk__block-when">{when}</div>
                    <div className="bk__block-reason">{b.reason}</div>
                    <div className="bk__block-act">
                      {confirmId === b.id ? (
                        <div key="ask" className="bk__actions bk__actions--ask">
                          <span className="bk__ask">Hapus blokir ini?</span>
                          <button
                            type="button"
                            className="bk__ctl bk__ctl--sm bk__ctl--dark"
                            disabled={disabled}
                            onClick={() => remove(b.id)}
                          >
                            Ya, hapus
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
                        <button
                          key="idle"
                          type="button"
                          className="bk__textbtn"
                          disabled={disabled}
                          aria-label={`Hapus blokir ${when}`}
                          onClick={() => setConfirmId(b.id)}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>

          {/* Paginasi hanya muncul bila lebih dari satu halaman (> 20 blokir). */}
          {data && data.last_page > 1 && (
            <nav className="bk__pager" aria-label="Halaman daftar blokir">
              <span>
                {from}–{to} dari {data.total}
              </span>
              <div>
                <button
                  type="button"
                  className="bk__ctl bk__ctl--sm"
                  disabled={loading || data.current_page <= 1}
                  onClick={() => setPage(data.current_page - 1)}
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  className="bk__ctl bk__ctl--sm"
                  disabled={loading || data.current_page >= data.last_page}
                  onClick={() => setPage(data.current_page + 1)}
                >
                  Berikutnya
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </>
  );
}
