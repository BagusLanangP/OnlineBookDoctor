import Checkbox from '@/Components/Checkbox';
import InputError from '@/Components/InputError';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { DAYS } from '@/lib/days';
import { formatDuration, MINUTES_PER_DAY, toMinutes } from '@/lib/time';
import { Practitioner, ScheduleRow } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { ChangeEvent, FormEventHandler, useEffect } from 'react';

// Props = bentuk data yang diterima halaman ini dari controller (ScheduleWeekController::edit).
// Ini hanya "deskripsi tipe" untuk TypeScript, bukan data itu sendiri: berguna agar salah ketik
// nama field atau salah tipe ketahuan saat menulis kode, lalu hilang setelah build.
// Nama field harus sama dengan key di Inertia::render(...) pada controller.
interface Props {
    practitioners: Practitioner[]; // semua practitioner di klinik (isi dropdown)
    practitioner: Practitioner | null; // yang sedang dipilih; null jika klinik belum punya practitioner
    schedules: ScheduleRow[]; // jadwal mingguan practitioner terpilih (hanya hari yang aktif)
}

// Satu hari di dalam form. Beda dengan ScheduleRow (data dari server, hanya hari aktif),
// DayState selalu ada 7 buah, dan `working = false` berarti hari itu libur.
interface DayState {
    dow: number; // day of week: 0 = Minggu ... 6 = Sabtu
    working: boolean; // dicentang = praktek di hari itu
    start_time: string; // "09:00"
    end_time: string;
}

// Jam bawaan saat sebuah hari baru dicentang dan belum pernah punya jadwal
const DEFAULT_START = '09:00';
const DEFAULT_END = '17:00';

// Lebar kolom grid dipakai bersama oleh baris sumbu jam dan setiap baris hari,
// supaya bar preview sejajar dengan angka 00-24 di atasnya.
// Kolom: nama hari | input jam | bar preview (di layar kecil ditumpuk ke bawah)
const ROW_GRID = 'sm:grid-cols-[9rem_15rem_1fr]';

/**
 * Mengubah data dari server (hanya hari aktif) menjadi 7 baris form.
 * Output : 7 DayState urut Senin..Minggu (urutan DAYS).
 * Hari yang ada di `schedules` => working: true dengan jam tersimpan;
 * hari lain => working: false dengan jam bawaan 09:00-17:00.
 */
function buildDays(schedules: ScheduleRow[]): DayState[] {
    return DAYS.map(({ dow }) => {
        const saved = schedules.find((s) => s.day_of_week === dow);
        return {
            dow,
            working: saved !== undefined,
            start_time: saved?.start_time ?? DEFAULT_START,
            end_time: saved?.end_time ?? DEFAULT_END,
        };
    });
}

/**
 * Validasi di browser untuk satu hari.
 * Output : teks pesan error, atau null jika valid / hari libur.
 * Hanya untuk kenyamanan (pesan langsung muncul); validasi sebenarnya tetap di server
 * (SyncSchedulesRequest) karena request bisa dikirim tanpa lewat form ini.
 */
function validateDay(day: DayState): string | null {
    if (!day.working) return null;

    const start = toMinutes(day.start_time);
    const end = toMinutes(day.end_time);

    if (start === null || end === null) return 'Enter both a start and an end time.';
    if (end <= start) return 'End time must be after the start time.';
    return null;
}

/**
 * Bar preview: jalur 00:00-24:00, bagian jam kerja diwarnai.
 * Posisi kiri dan lebar dihitung sebagai persen dari 1440 menit sehari.
 * Dihitung dari state form, jadi ikut berubah saat jam diketik.
 * aria-hidden: murni hiasan visual; informasinya sudah ada di input jam.
 */
function DayBar({ day }: { day: DayState }) {
    const start = toMinutes(day.start_time);
    const end = toMinutes(day.end_time);
    const valid = day.working && start !== null && end !== null && end > start;

    return (
        <div aria-hidden="true" className="relative h-2 rounded-full bg-gray-100">
            {valid && (
                <div
                    className="absolute inset-y-0 rounded-full bg-indigo-500"
                    style={{
                        left: `${(start / MINUTES_PER_DAY) * 100}%`,
                        width: `${((end - start) / MINUTES_PER_DAY) * 100}%`,
                    }}
                />
            )}
        </div>
    );
}

/**
 * Form 7 hari untuk SATU practitioner.
 * Proses: tampilkan data -> pengguna ubah (state di useForm) -> klik Save -> kirim PUT
 * -> controller menyimpan lalu `back()` -> Inertia mengirim props baru.
 */
function WeekForm({
    practitioner,
    schedules,
}: {
    practitioner: Practitioner;
    schedules: ScheduleRow[];
}) {
    // State form hidup di sini (bukan di props). Props hanya nilai awal; mengetik jam baru
    // tidak mengubah `schedules`, hanya mengubah form.data.days.
    const form = useForm<{ days: DayState[] }>({ days: buildDays(schedules) });
    const { days } = form.data;
    // Error dari server berkunci "schedules.N.field", sedangkan tipe useForm hanya tahu "days".
    const serverErrors = form.errors as Record<string, string | undefined>;

    // Server hanya memvalidasi daftar hari KERJA, jadi "schedules.0" berarti hari kerja
    // pertama, bukan Senin. Daftar yang sama dibangun ulang di sini untuk memetakan
    // nomor urut error dari server -> hari yang benar.
    const serverIndex = new Map<number, number>();
    days.filter((d) => d.working).forEach((d, i) => serverIndex.set(d.dow, i));

    // Pesan error satu hari: cek browser dulu, kalau lolos baru pakai error dari server.
    const errorFor = (day: DayState): string | undefined => {
        const i = serverIndex.get(day.dow);
        return (
            validateDay(day) ??
            (i === undefined
                ? undefined
                : (serverErrors[`schedules.${i}.day_of_week`] ??
                  serverErrors[`schedules.${i}.start_time`] ??
                  serverErrors[`schedules.${i}.end_time`])) ??
            undefined
        );
    };

    // Ada minimal satu hari yang tidak valid -> tombol Save dimatikan
    const hasClientError = days.some((d) => validateDay(d) !== null);

    // Tanya konfirmasi sebelum perpindahan halaman (GET: ganti practitioner, klik menu)
    // membuang perubahan yang belum disimpan. Simpan memakai PUT, jadi tidak pernah diblokir.
    // Hanya aktif saat form "dirty" (ada perubahan); listener dilepas lewat nilai return.
    useEffect(() => {
        if (!form.isDirty) return;

        return router.on('before', (event) => {
            if (event.detail.visit.method !== 'get') return;
            return window.confirm(
                'You have unsaved schedule changes. Leave without saving?',
            );
        });
    }, [form.isDirty]);

    // Ubah satu hari (centang atau jam) tanpa menyentuh hari lain.
    // Error lama dihapus karena sudah tidak relevan dengan isian terbaru.
    const updateDay = (dow: number, patch: Partial<DayState>) => {
        form.clearErrors();
        form.setData(
            'days',
            days.map((d) => (d.dow === dow ? { ...d, ...patch } : d)),
        );
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault(); // cegah browser me-reload halaman; Inertia yang mengirim request
        if (hasClientError) return;

        // Hanya hari kerja yang dikirim; server menghapus semua hari yang tidak ada di daftar.
        // Bentuknya disesuaikan dengan yang diminta SyncSchedulesRequest.
        form.transform((data) => ({
            schedules: data.days
                .filter((d) => d.working)
                .map(({ dow, start_time, end_time }) => ({
                    day_of_week: dow,
                    start_time,
                    end_time,
                })),
        }));
        form.put(route('schedules.update', practitioner.id), {
            preserveScroll: true, // posisi scroll tidak lompat ke atas setelah simpan
            // Data yang baru tersimpan menjadi patokan baru: form tidak lagi "dirty",
            // sehingga tombol Discard dan peringatan keluar halaman mati.
            onSuccess: () => form.setDefaults(),
        });
    };

    // Ringkasan di bawah form: jumlah hari kerja dan total jam per minggu.
    // Hari yang jamnya tidak valid tidak ikut dihitung.
    const workingDays = days.filter((d) => d.working);
    const totalMinutes = workingDays.reduce((sum, d) => {
        const start = toMinutes(d.start_time);
        const end = toMinutes(d.end_time);
        return start !== null && end !== null && end > start
            ? sum + (end - start)
            : sum;
    }, 0);

    return (
        // noValidate: pesan error memakai validasi kita sendiri, bukan balon bawaan browser
        <form
            onSubmit={submit}
            noValidate
            className="overflow-hidden bg-white shadow-sm sm:rounded-lg"
        >
            {/* Sumbu jam 00-24 di atas bar preview (disembunyikan di layar kecil dan dari screen reader) */}
            <div
                aria-hidden="true"
                className={`hidden gap-x-4 px-6 pb-1 pt-4 text-xs text-gray-500 sm:grid ${ROW_GRID}`}
            >
                <span />
                <span />
                <div className="flex justify-between tabular-nums">
                    {['00', '06', '12', '18', '24'].map((h) => (
                        <span key={h}>{h}</span>
                    ))}
                </div>
            </div>

            {/* Satu baris per hari, urut Senin..Minggu */}
            <ul className="divide-y divide-gray-100">
                {days.map((day) => {
                    const label = DAYS.find((d) => d.dow === day.dow)!.label;
                    const error = errorFor(day);
                    const errorId = `day-${day.dow}-error`;
                    // Atribut yang sama untuk input jam mulai dan selesai.
                    // aria-invalid + aria-describedby menghubungkan input dengan pesan errornya
                    // untuk pembaca layar.
                    const timeProps = (field: 'start_time' | 'end_time') => ({
                        type: 'time' as const,
                        step: 300, // kelipatan 5 menit
                        value: day[field],
                        onChange: (e: ChangeEvent<HTMLInputElement>) =>
                            updateDay(day.dow, { [field]: e.target.value }),
                        'aria-invalid': error ? true : undefined,
                        'aria-describedby': error ? errorId : undefined,
                        className:
                            'w-full py-1.5 text-sm tabular-nums sm:w-auto ' +
                            (error ? 'border-red-400' : ''),
                    });

                    return (
                        <li
                            key={day.dow}
                            className={`grid gap-x-4 gap-y-2 px-6 py-4 sm:items-center ${ROW_GRID}`}
                        >
                            {/* htmlFor: mengklik nama hari ikut mencentang checkbox */}
                            <label
                                htmlFor={`working-${day.dow}`}
                                className="flex items-center gap-3 text-sm font-medium text-gray-900"
                            >
                                <Checkbox
                                    id={`working-${day.dow}`}
                                    checked={day.working}
                                    onChange={(e) =>
                                        updateDay(day.dow, {
                                            working: e.target.checked,
                                        })
                                    }
                                />
                                {label}
                            </label>

                            {/* Hari kerja: dua input jam. Hari libur: tulisan "Off". */}
                            {day.working ? (
                                <div className="flex items-center gap-2">
                                    <TextInput
                                        aria-label={`${label} start time`}
                                        {...timeProps('start_time')}
                                    />
                                    <span aria-hidden="true" className="text-gray-400">
                                        –
                                    </span>
                                    <TextInput
                                        aria-label={`${label} end time`}
                                        {...timeProps('end_time')}
                                    />
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">Off</p>
                            )}

                            <DayBar day={day} />

                            {/* Pesan error hari ini (dari browser atau server), di bawah baris */}
                            {error && (
                                <InputError
                                    id={errorId}
                                    role="alert"
                                    message={error}
                                    className="sm:col-span-3"
                                />
                            )}
                        </li>
                    );
                })}
            </ul>

            {/* Footer: ringkasan di kiri, status dan tombol di kanan */}
            <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm tabular-nums text-gray-600">
                    {workingDays.length === 0
                        ? 'No working days: no new bookings can be made.'
                        : `${workingDays.length} working ${
                              workingDays.length === 1 ? 'day' : 'days'
                          } · ${formatDuration(totalMinutes)} per week`}
                </p>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Selalu dirender agar perubahan teksnya diumumkan pembaca layar;
                        empty:sr-only menjaganya tidak memakan ruang saat kosong (tidak ada celah ekstra). */}
                    <span
                        role="status"
                        className="text-sm text-gray-600 empty:sr-only"
                    >
                        {form.recentlySuccessful
                            ? 'Saved'
                            : hasClientError
                              ? 'Fix the highlighted times to save.'
                              : form.isDirty
                                ? 'Unsaved changes'
                                : ''}
                    </span>

                    {/* Discard: kembalikan form ke data terakhir yang tersimpan */}
                    <SecondaryButton
                        onClick={() => {
                            form.reset();
                            form.clearErrors();
                        }}
                        disabled={!form.isDirty || form.processing}
                    >
                        Discard
                    </SecondaryButton>
                    {/* Save aktif hanya jika ada perubahan, semua jam valid, dan tidak sedang menyimpan */}
                    <PrimaryButton
                        type="submit"
                        disabled={
                            !form.isDirty || hasClientError || form.processing
                        }
                    >
                        {form.processing ? 'Saving…' : 'Save'}
                    </PrimaryButton>
                </div>
            </div>
        </form>
    );
}

// Komponen halaman. Dipanggil oleh Inertia, yang mengisi parameternya dengan data dari
// ScheduleWeekController::edit() (dibaca dari database, dikirim lewat Inertia::render).
// Dua hal yang menyambungkannya: nama halaman 'Schedules/Edit' = lokasi file ini,
// dan nama key di controller = nama variabel di parameter.
// `: Props` hanya pemeriksaan tipe oleh TypeScript, bukan yang mengirim data.
export default function Edit({ practitioners, practitioner, schedules }: Props) {
    return (
        // AuthenticatedLayout menyediakan kerangka halaman (navbar, header, area konten);
        // semua yang ada di dalamnya tampil sebagai isi halaman (children).
        <AuthenticatedLayout
            header={
                <h2 className="text-xl font-semibold leading-tight text-gray-800">
                    Schedules
                    <span className="ml-2 text-sm font-normal text-gray-500">
                        Weekly working hours, repeated every week
                    </span>
                </h2>
            }
        >
            {/* Mengatur judul tab browser */}
            <Head title="Schedules" />

            <div className="py-12">
                <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6 lg:px-8">
                    {/* null = klinik belum punya practitioner -> tampilkan keadaan kosong */}
                    {practitioner === null ? (
                        <section className="bg-white p-6 shadow-sm sm:rounded-lg">
                            <p className="text-sm text-gray-500">
                                No practitioners yet.
                            </p>
                        </section>
                    ) : (
                        <>
                            <div>
                                <label
                                    htmlFor="practitioner"
                                    className="block text-sm font-medium text-gray-700"
                                >
                                    Practitioner
                                </label>
                                {/* Ganti pilihan = minta halaman yang sama dengan ?practitioner=ID,
                                    controller lalu mengirim jadwal practitioner itu */}
                                <select
                                    id="practitioner"
                                    value={practitioner.id}
                                    onChange={(e) =>
                                        router.get(
                                            route('schedules.edit'),
                                            { practitioner: e.target.value },
                                            { preserveScroll: true },
                                        )
                                    }
                                    className="mt-2 w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:w-80"
                                >
                                    {practitioners.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.specialty
                                                ? `${p.name} · ${p.specialty}`
                                                : p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* key: dibuat ulang saat practitioner berganti, supaya useForm
                                mengisi ulang dari props yang baru (tanpa key, isi lama tertinggal) */}
                            <WeekForm
                                key={practitioner.id}
                                practitioner={practitioner}
                                schedules={schedules}
                            />
                        </>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
