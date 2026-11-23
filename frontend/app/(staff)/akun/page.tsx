"use client";

// Halaman Akun (Task 11, menggantikan kartu akun Task 9a).
//
// Satu halaman, tiga bagian + pratinjau:
//  1. Profil klinik: form identitas, lokasi, kontak, zona waktu. Satu tombol
//     "Simpan profil" (nonaktif bila tidak ada perubahan).
//  2. Pratinjau "seperti yang dilihat pasien": dibuat dari isi form SAAT INI,
//     jadi ikut berubah sebelum disimpan (diberi keterangan "Belum disimpan").
//  3. Dokter: ubah per baris, hapus dua langkah, tambah di baris bawah. Jumlah
//     dokter selalu dihitung dari daftar. Dokter yang sudah punya booking tidak
//     bisa dihapus (Laravel membalas 409, pesannya ditampilkan di baris itu).
//  4. Akun: nama, email, tombol Keluar.
//
// Pertanyaan yang dijawab layar ini: "Apa yang dilihat pasien tentang klinik
// saya, dan sudah benar belum?"
//
// Pola kodenya sama dengan /bookings dan /blocked-times: respons lama diabaikan
// (`alive`), klik ganda ditahan dengan useRef. Fungsi murni (validasi, pratinjau,
// format nomor) ada di lib/clinic.ts dan sudah dites.
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";
import type { Practitioner } from "@/lib/booking";
import { fetchPractitioners } from "@/lib/booking-api";
import {
  LIMITS,
  TIMEZONES,
  formFromProfile,
  isClinicDirty,
  payloadFrom,
  previewFrom,
  serverFieldErrors,
  validateClinicForm,
  validatePractitionerForm,
  type ClinicField,
  type ClinicForm,
  type ClinicProfile,
  type FieldErrors,
  type PractitionerForm,
} from "@/lib/clinic";
import {
  createPractitioner,
  deletePractitioner,
  fetchClinic,
  updateClinic,
  updatePractitioner,
} from "@/lib/clinic-api";
import type { Me } from "@/lib/me";

const CLINIC_FIELDS: readonly ClinicField[] = [
  "name",
  "description",
  "address",
  "city",
  "maps_url",
  "phone",
  "whatsapp_number",
  "timezone",
];
const DOCTOR_FIELDS = ["name", "specialty"] as const;
const EMPTY_DOCTOR: PractitionerForm = { name: "", specialty: "" };

// Pesan dari body error Laravel ({ message: "..." }), bila ada.
function bodyMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const m = (body as { message?: unknown }).message;
  return typeof m === "string" && m ? m : null;
}

function byName(a: Practitioner, b: Practitioner) {
  return a.name.localeCompare(b.name, "id");
}

// ---------------------------------------------------------------------------
// Tahap 1: memuat user, lalu (bila ada klinik) profil dan dokter
// ---------------------------------------------------------------------------
type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "no-clinic"; me: Me }
  | { kind: "ready"; me: Me; clinic: ClinicProfile; practitioners: Practitioner[] };

export default function AkunPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await api<Me>("/user");
        if (!alive) return;
        if (!me.clinic) {
          setState({ kind: "no-clinic", me });
          return;
        }
        const [clinic, practitioners] = await Promise.all([fetchClinic(), fetchPractitioners()]);
        if (alive) setState({ kind: "ready", me, clinic, practitioners });
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        } else {
          setState({
            kind: "error",
            message: "Tidak bisa memuat data akun. Pastikan Laravel berjalan, lalu coba lagi.",
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [router, reloadKey]);

  if (state.kind === "loading" || state.kind === "error") {
    return (
      <Shell>
        <h1 className="bk__h1">Akun</h1>
        {state.kind === "error" ? (
          <div className="bk__error" role="alert">
            <span>{state.message}</span>
            <button
              type="button"
              className="bk__textbtn"
              onClick={() => {
                setState({ kind: "loading" });
                setReloadKey((k) => k + 1);
              }}
            >
              Coba lagi
            </button>
          </div>
        ) : (
          <>
            <p className="sr-only-text" aria-live="polite">
              Memuat…
            </p>
            <SkeletonPage />
          </>
        )}
      </Shell>
    );
  }

  if (state.kind === "no-clinic") {
    return (
      <Shell userName={state.me.user.name}>
        <h1 className="bk__h1">Akun</h1>
        <p className="bk__empty">Akun ini belum terhubung ke klinik.</p>
        <div className="bk__acct-solo">
          <AccountSection me={state.me} />
        </div>
      </Shell>
    );
  }

  return <AccountView me={state.me} initialClinic={state.clinic} initialPractitioners={state.practitioners} />;
}

function SkeletonPage() {
  return (
    <div className="bk__acctgrid" aria-hidden="true">
      <div className="bk__form bk__acct-profile">
        <span className="bk__bar" style={{ width: 120, height: 16 }} />
        <div className="bk__fields">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <span key={i} className="bk__bar bk__bar--ctl" />
          ))}
        </div>
      </div>
      <div className="bk__preview">
        <span className="bk__bar" style={{ width: 180, height: 16 }} />
        <span className="bk__bar" style={{ width: 240, marginTop: 12 }} />
        <span className="bk__bar" style={{ width: 200, marginTop: 8 }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tahap 2: halaman lengkap
// ---------------------------------------------------------------------------
function AccountView({
  me,
  initialClinic,
  initialPractitioners,
}: {
  me: Me;
  initialClinic: ClinicProfile;
  initialPractitioners: Practitioner[];
}) {
  // `saved` = profil terakhir dari server; `form` = isi kolom sekarang.
  const [saved, setSaved] = useState(initialClinic);
  const [form, setForm] = useState<ClinicForm>(() => formFromProfile(initialClinic));
  const [practitioners, setPractitioners] = useState(() => [...initialPractitioners].sort(byName));

  const dirty = isClinicDirty(saved, form);
  const preview = previewFrom(form, practitioners);

  return (
    <Shell clinicName={saved.name} userName={me.user.name}>
      <h1 className="bk__h1">Akun</h1>
      <p className="bk__sub">Profil klinik yang dilihat pasien, dokter, dan akun Anda.</p>

      {/* Urutan di kode = urutan baca di layar kecil: profil, pratinjau, dokter, akun.
          Layar lebar (>= 1180px): pratinjau pindah ke kolom kanan dan menempel. */}
      <div className="bk__acctgrid">
        <ProfileSection saved={saved} form={form} setForm={setForm} dirty={dirty} onSaved={setSaved} />

        <aside className="bk__preview" aria-labelledby="preview-title">
          <div className="bk__preview-head">
            <h2 id="preview-title" className="bk__h2">
              Seperti yang dilihat pasien
            </h2>
            {dirty && <span className="bk__stamp">Belum disimpan</span>}
          </div>
          <div className="bk__preview-card">
            <p className="bk__preview-name">{preview.name}</p>
            {preview.description && <p className="bk__preview-desc">{preview.description}</p>}
            {(preview.location || preview.mapsUrl) && (
              <p className="bk__preview-line">
                {preview.location}
                {preview.location && preview.mapsUrl && " · "}
                {preview.mapsUrl && (
                  <a href={preview.mapsUrl} target="_blank" rel="noopener noreferrer" className="bk__textlink">
                    Buka peta
                  </a>
                )}
              </p>
            )}
            {(preview.phone || preview.whatsapp) && (
              <dl className="bk__preview-contact">
                {preview.phone && (
                  <div>
                    <dt>Telepon</dt>
                    <dd>{preview.phone}</dd>
                  </div>
                )}
                {preview.whatsapp && (
                  <div>
                    <dt>WhatsApp</dt>
                    <dd>
                      <a
                        href={preview.whatsapp.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bk__textlink"
                      >
                        {preview.whatsapp.label}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            )}
            <p className="bk__preview-count">
              {preview.doctorCount} dokter · jam {preview.timezoneLabel}
            </p>
            {preview.doctors.length > 0 && (
              <ul className="bk__preview-docs">
                {preview.doctors.map((d) => (
                  <li key={d.id}>
                    <span>{d.name}</span>
                    {d.specialty && <span className="bk__muted">{d.specialty}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <DoctorsSection practitioners={practitioners} setPractitioners={setPractitioners} />

        <div className="bk__acct-account">
          <AccountSection me={me} />
        </div>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Profil klinik
// ---------------------------------------------------------------------------
function ProfileSection({
  saved,
  form,
  setForm,
  dirty,
  onSaved,
}: {
  saved: ClinicProfile;
  form: ClinicForm;
  setForm: (f: (prev: ClinicForm) => ClinicForm) => void;
  dirty: boolean;
  onSaved: (p: ClinicProfile) => void;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors<ClinicField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savingRef = useRef(false);

  function update(field: ClinicField, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
    setFormError(null);
    setJustSaved(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (savingRef.current || !dirty) return;
    const local = validateClinicForm(form);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      setFormError("Periksa kolom yang ditandai.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const res = await updateClinic(payloadFrom(form));
      onSaved(res);
      setForm(() => formFromProfile(res));
      setErrors({});
      setJustSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
      } else if (err instanceof ApiError && err.status === 422) {
        setErrors(serverFieldErrors(err.body, CLINIC_FIELDS));
        setFormError("Periksa kolom yang ditandai.");
      } else {
        setFormError("Gagal menyimpan profil. Coba lagi.");
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // Zona lama di luar tiga pilihan (mis. "UTC" dari data lama) tetap tampil
  // sebagai pilihan tambahan, tapi menyimpan mengharuskan memilih salah satu.
  const legacyTz = TIMEZONES.some((t) => t.value === saved.timezone) ? null : saved.timezone;
  const tzChanged = form.timezone !== saved.timezone;

  return (
    <section className="bk__acct-profile" aria-labelledby="profile-title">
      <form className="bk__form" onSubmit={submit} noValidate>
        <h2 id="profile-title" className="bk__h2">
          Profil klinik
        </h2>
        <div className="bk__fields">
          <Field label="Nama klinik" error={errors.name} wide>
            {(p) => (
              <input
                {...p}
                type="text"
                className="bk__ctl"
                maxLength={LIMITS.name}
                autoComplete="organization"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Deskripsi singkat"
            error={errors.description}
            hint={`${form.description.length}/${LIMITS.description}`}
            wide
          >
            {(p) => (
              <textarea
                {...p}
                className="bk__ctl bk__ctl--area"
                rows={3}
                maxLength={LIMITS.description}
                placeholder="Klinik umum keluarga, melayani anak dan dewasa."
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            )}
          </Field>
          <Field label="Alamat" error={errors.address} wide>
            {(p) => (
              <input
                {...p}
                type="text"
                className="bk__ctl"
                maxLength={LIMITS.address}
                autoComplete="street-address"
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
              />
            )}
          </Field>
          <Field label="Kota" error={errors.city}>
            {(p) => (
              <input
                {...p}
                type="text"
                className="bk__ctl"
                maxLength={LIMITS.city}
                autoComplete="address-level2"
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
              />
            )}
          </Field>
          <Field label="Tautan peta" error={errors.maps_url}>
            {(p) => (
              <input
                {...p}
                type="url"
                inputMode="url"
                className="bk__ctl"
                placeholder="https://maps.app.goo.gl/…"
                value={form.maps_url}
                onChange={(e) => update("maps_url", e.target.value)}
              />
            )}
          </Field>
          <Field label="Telepon" error={errors.phone}>
            {(p) => (
              <input
                {...p}
                type="tel"
                inputMode="tel"
                className="bk__ctl"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            )}
          </Field>
          <Field label="WhatsApp" error={errors.whatsapp_number}>
            {(p) => (
              <input
                {...p}
                type="tel"
                inputMode="tel"
                className="bk__ctl"
                value={form.whatsapp_number}
                onChange={(e) => update("whatsapp_number", e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Zona waktu"
            error={errors.timezone}
            hint={tzChanged ? "Semua jam booking dan blokir akan ditampilkan dalam zona baru." : undefined}
            hintTone={tzChanged ? "warn" : undefined}
            wide
          >
            {(p) => (
              <select
                {...p}
                className="bk__ctl"
                value={form.timezone}
                onChange={(e) => update("timezone", e.target.value)}
              >
                {legacyTz && <option value={legacyTz}>{legacyTz} (pilih zona Indonesia)</option>}
                {TIMEZONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <p role="alert" className="bk__alert" hidden={!formError}>
          {formError}
        </p>
        <div className="bk__formfoot">
          <button type="submit" className="bk__ctl bk__ctl--dark" disabled={saving || !dirty}>
            {saving ? "Menyimpan…" : "Simpan profil"}
          </button>
          <span role="status" className="bk__muted">
            {justSaved && !dirty ? "Tersimpan" : ""}
          </span>
        </div>
      </form>
    </section>
  );
}

// Satu kolom form: label terlihat di atas, kontrol, lalu keterangan / pesan error.
// Kontrol menerima id, aria-invalid, dan aria-describedby lewat `p`.
function Field({
  label,
  error,
  hint,
  hintTone,
  wide,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  hintTone?: "warn";
  wide?: boolean;
  children: (p: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className={`bk__field${wide ? " bk__field--wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        ...(error ? { "aria-invalid": true as const } : {}),
        ...(note ? { "aria-describedby": noteId } : {}),
      })}
      {note && (
        <p
          id={noteId}
          className={`bk__note${error ? " bk__note--error" : hintTone === "warn" ? " bk__note--warn" : ""}`}
        >
          {note}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dokter
// ---------------------------------------------------------------------------
function DoctorsSection({
  practitioners,
  setPractitioners,
}: {
  practitioners: Practitioner[];
  setPractitioners: (f: (prev: Practitioner[]) => Practitioner[]) => void;
}) {
  const router = useRouter();
  // Hanya satu baris yang diubah / dikonfirmasi hapus pada satu waktu.
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PractitionerForm>(EMPTY_DOCTOR);
  const [editErrors, setEditErrors] = useState<FieldErrors<"name" | "specialty">>({});
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const busyRef = useRef(false);

  const [newForm, setNewForm] = useState<PractitionerForm>(EMPTY_DOCTOR);
  const [newErrors, setNewErrors] = useState<FieldErrors<"name" | "specialty">>({});
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Error umum (401/403/jaringan) untuk satu aksi. Mengembalikan pesan untuk ditampilkan.
  function failMessage(err: unknown, fallback: string): string | null {
    if (err instanceof ApiError && err.status === 401) {
      router.replace("/login");
      return null;
    }
    if (err instanceof ApiError && err.status === 403) return "Dokter ini bukan milik klinik Anda.";
    return fallback;
  }

  function startEdit(p: Practitioner) {
    setEditId(p.id);
    setEditForm({ name: p.name, specialty: p.specialty ?? "" });
    setEditErrors({});
    setConfirmId(null);
    setRowError(null);
  }

  function cancelEdit() {
    setEditId(null);
    setEditErrors({});
  }

  async function saveEdit(e: FormEvent, id: number) {
    e.preventDefault();
    if (busyRef.current) return;
    const local = validatePractitionerForm(
      editForm,
      practitioners.filter((p) => p.id !== id),
    );
    if (Object.keys(local).length > 0) {
      setEditErrors(local);
      return;
    }
    busyRef.current = true;
    setBusyId(id);
    setRowError(null);
    try {
      const res = await updatePractitioner(id, {
        name: editForm.name.trim(),
        specialty: editForm.specialty.trim(),
      });
      setPractitioners((list) => list.map((p) => (p.id === id ? res : p)).sort(byName));
      setEditId(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setEditErrors(serverFieldErrors(err.body, DOCTOR_FIELDS));
      } else {
        const m = failMessage(err, "Gagal menyimpan dokter. Coba lagi.");
        if (m) setRowError({ id, message: m });
      }
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(id);
    setRowError(null);
    try {
      await deletePractitioner(id);
      setPractitioners((list) => list.filter((p) => p.id !== id));
      setConfirmId(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Sudah terhapus (tab lain / klik ganda): hasilnya sama.
        setPractitioners((list) => list.filter((p) => p.id !== id));
        setConfirmId(null);
      } else if (err instanceof ApiError && err.status === 409) {
        setConfirmId(null);
        setRowError({
          id,
          message: bodyMessage(err.body) ?? "Dokter ini punya booking, jadi tidak bisa dihapus.",
        });
      } else {
        const m = failMessage(err, "Gagal menghapus dokter. Coba lagi.");
        if (m) setRowError({ id, message: m });
      }
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    const local = validatePractitionerForm(newForm, practitioners);
    if (Object.keys(local).length > 0) {
      setNewErrors(local);
      return;
    }
    busyRef.current = true;
    setAdding(true);
    setAddError(null);
    try {
      const res = await createPractitioner({
        name: newForm.name.trim(),
        specialty: newForm.specialty.trim(),
      });
      setPractitioners((list) => [...list, res].sort(byName));
      setNewForm(EMPTY_DOCTOR);
      setNewErrors({});
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setNewErrors(serverFieldErrors(err.body, DOCTOR_FIELDS));
      } else {
        setAddError(failMessage(err, "Gagal menambah dokter. Coba lagi."));
      }
    } finally {
      busyRef.current = false;
      setAdding(false);
    }
  }

  const disabled = busyId !== null || adding;

  return (
    <section className="bk__acct-doctors" aria-labelledby="doctors-title">
      <h2 id="doctors-title" className="bk__h2">
        Dokter <span className="bk__muted">· {practitioners.length} terdaftar</span>
      </h2>

      {practitioners.length === 0 ? (
        <p className="bk__empty">Belum ada dokter. Tambahkan dokter pertama di bawah.</p>
      ) : (
        <ul className="bk__doclist" aria-label="Daftar dokter">
          {practitioners.map((p) =>
            editId === p.id ? (
              <li key={p.id} className="bk__doc bk__doc--edit">
                <form className="bk__docform" onSubmit={(e) => saveEdit(e, p.id)} noValidate>
                  <Field label="Nama dokter" error={editErrors.name}>
                    {(a) => (
                      <input
                        {...a}
                        type="text"
                        className="bk__ctl"
                        maxLength={255}
                        autoFocus
                        value={editForm.name}
                        onChange={(e) => {
                          setEditForm((f) => ({ ...f, name: e.target.value }));
                          setEditErrors((x) => ({ ...x, name: undefined }));
                        }}
                        onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                      />
                    )}
                  </Field>
                  <Field label="Spesialisasi" error={editErrors.specialty}>
                    {(a) => (
                      <input
                        {...a}
                        type="text"
                        className="bk__ctl"
                        maxLength={255}
                        value={editForm.specialty}
                        onChange={(e) => {
                          setEditForm((f) => ({ ...f, specialty: e.target.value }));
                          setEditErrors((x) => ({ ...x, specialty: undefined }));
                        }}
                        onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                      />
                    )}
                  </Field>
                  <div className="bk__actions bk__docform-act">
                    <button type="submit" className="bk__ctl bk__ctl--sm bk__ctl--dark" disabled={disabled}>
                      {busyId === p.id ? "Menyimpan…" : "Simpan"}
                    </button>
                    <button type="button" className="bk__textbtn" disabled={disabled} onClick={cancelEdit}>
                      Batal
                    </button>
                  </div>
                </form>
                {rowError?.id === p.id && (
                  <p role="alert" className="bk__alert bk__doc-msg">
                    {rowError.message}
                  </p>
                )}
              </li>
            ) : (
              <li key={p.id} className="bk__doc">
                <span className="bk__doc-name">{p.name}</span>
                <span className="bk__doc-spec">{p.specialty || "–"}</span>
                <div className="bk__doc-act">
                  {confirmId === p.id ? (
                    <div key="ask" className="bk__actions bk__actions--ask">
                      <span className="bk__ask">Hapus dokter ini?</span>
                      <button
                        type="button"
                        className="bk__ctl bk__ctl--sm bk__ctl--dark"
                        disabled={disabled}
                        onClick={() => remove(p.id)}
                      >
                        {busyId === p.id ? "Menghapus…" : "Ya, hapus"}
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
                        className="bk__textbtn"
                        disabled={disabled}
                        aria-label={`Ubah ${p.name}`}
                        onClick={() => startEdit(p)}
                      >
                        Ubah
                      </button>
                      <button
                        type="button"
                        className="bk__textbtn"
                        disabled={disabled}
                        aria-label={`Hapus ${p.name}`}
                        onClick={() => {
                          setConfirmId(p.id);
                          setEditId(null);
                          setRowError(null);
                        }}
                      >
                        Hapus
                      </button>
                    </div>
                  )}
                </div>
                {rowError?.id === p.id && (
                  <p role="alert" className="bk__alert bk__doc-msg">
                    {rowError.message}
                  </p>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      <form className="bk__docform bk__docform--new" onSubmit={add} noValidate aria-label="Tambah dokter">
        <Field label="Nama dokter" error={newErrors.name}>
          {(a) => (
            <input
              {...a}
              type="text"
              className="bk__ctl"
              maxLength={255}
              placeholder="dr. Ahmad Wijaya"
              value={newForm.name}
              onChange={(e) => {
                setNewForm((f) => ({ ...f, name: e.target.value }));
                setNewErrors((x) => ({ ...x, name: undefined }));
                setAddError(null);
              }}
            />
          )}
        </Field>
        <Field label="Spesialisasi" error={newErrors.specialty}>
          {(a) => (
            <input
              {...a}
              type="text"
              className="bk__ctl"
              maxLength={255}
              placeholder="Umum"
              value={newForm.specialty}
              onChange={(e) => {
                setNewForm((f) => ({ ...f, specialty: e.target.value }));
                setNewErrors((x) => ({ ...x, specialty: undefined }));
              }}
            />
          )}
        </Field>
        <div className="bk__docform-act">
          <button type="submit" className="bk__ctl" disabled={disabled}>
            {adding ? "Menambah…" : "Tambah dokter"}
          </button>
        </div>
      </form>
      <p role="alert" className="bk__alert" hidden={!addError}>
        {addError}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Akun
// ---------------------------------------------------------------------------
function AccountSection({ me }: { me: Me }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    try {
      await api("/logout", { method: "POST" });
    } catch {
      // Sesi sudah berakhir atau server tidak terjangkau; tetap kembali ke login.
    }
    router.replace("/login");
  }

  return (
    <section aria-labelledby="account-title">
      <h2 id="account-title" className="bk__h2">
        Akun
      </h2>
      <div className="bk__acctrow">
        <div>
          <p className="bk__doc-name">{me.user.name}</p>
          <p className="bk__muted">{me.user.email}</p>
        </div>
        <button type="button" className="bk__ctl" onClick={logout} disabled={leaving}>
          {leaving ? "Keluar…" : "Keluar"}
        </button>
      </div>
    </section>
  );
}
