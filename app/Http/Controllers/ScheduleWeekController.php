<?php

namespace App\Http\Controllers;

use App\Http\Requests\SyncSchedulesRequest;
use App\Models\Practitioner;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Mengelola jadwal kerja MINGGUAN (berulang tiap minggu) milik practitioner.
 *
 * Contoh: "Dr. Budi praktek Senin 09:00-15:00, Rabu 10:00-14:00, hari lain libur".
 * Satu practitioner punya maksimal 7 baris schedule (satu per hari, day_of_week 0-6).
 *
 * Controller ini punya 2 aksi:
 *  - edit()   -> menampilkan halaman form jadwal (GET)
 *  - update() -> menyimpan perubahan jadwal dari form (PUT/PATCH)
 */
class ScheduleWeekController extends Controller
{
    /**
     * Menampilkan halaman "Atur Jadwal Mingguan".
     *
     * Tujuan : menyiapkan data untuk halaman Inertia Schedules/Edit.
     * Output : halaman React/Vue dengan 3 props:
     *   - practitioners : daftar semua practitioner di klinik (untuk dropdown pilihan)
     *   - practitioner  : practitioner yang sedang dipilih (atau null jika klinik belum punya)
     *   - schedules     : jadwal mingguan practitioner terpilih,
     *                     bentuk [{day_of_week: 1, start_time: "09:00", end_time: "15:00"}, ...]
     *
     * Proses:
     *  1. Ambil klinik milik user yang login.
     *  2. Ambil practitioner klinik itu, urut nama.
     *  3. Tentukan practitioner terpilih (dari ?practitioner=ID, atau yang pertama).
     *  4. Ambil jadwalnya, ubah jam ke format "HH:mm" supaya cocok dengan input form.
     */
    public function edit(Request $request): Response
    {
        // Klinik milik user yang sedang login -> semua data di bawah dibatasi ke klinik ini
        $clinic = $request->user()->clinic;

        // Hanya practitioner milik klinik ini; ambil kolom seperlunya saja (hemat data ke frontend)
        $practitioners = $clinic->practitioners()
            ->orderBy('name')
            ->get(['id', 'name', 'specialty']);

        // Decision #4
        // Menentukan practitioner mana yang jadwalnya ditampilkan:
        if ($request->filled('practitioner')) {
            // User memilih lewat query string (?practitioner=5).
            // Dicari di daftar practitioner KLINIK SENDIRI, bukan di seluruh tabel,
            // jadi ID milik klinik lain tidak akan ketemu.
            $selected = $practitioners->firstWhere('id', $request->integer('practitioner'));

            // Tidak ketemu = ID bukan milik klinik ini (atau tidak ada) -> tolak 403
            abort_if($selected === null, 403);
        } else {
            // Tidak ada pilihan -> default practitioner pertama (null jika klinik belum punya practitioner)
            $selected = $practitioners->first();
        }

        // Jika ada practitioner terpilih, ambil jadwalnya urut Minggu(0) s/d Sabtu(6).
        // Jika tidak ada, kirim array kosong.
        $schedules = $selected
            ? $selected->schedules()->orderBy('day_of_week')->get()->map(fn ($s) => [
                'day_of_week' => $s->day_of_week,
                // getRawOriginal = nilai mentah dari DB ("09:00:00"), bukan hasil cast model.
                // substr(0, 5) memotong jadi "09:00" karena input <input type="time"> memakai format HH:mm
                'start_time' => substr((string) $s->getRawOriginal('start_time'), 0, 5),
                'end_time' => substr((string) $s->getRawOriginal('end_time'), 0, 5),
            ])
            : [];

        // Kirim data ke halaman resources/js/Pages/Schedules/Edit
        return Inertia::render('Schedules/Edit', [
            'practitioners' => $practitioners,
            'practitioner' => $selected,
            'schedules' => $schedules,
        ]);
    }

    /**
     * Menyimpan jadwal mingguan satu practitioner (model "sinkronisasi").
     *
     * Tujuan : membuat jadwal di DB PERSIS sama dengan yang dikirim form.
     * Input  : $request->schedules = daftar hari aktif, mis.
     *          [{day_of_week: 1, start_time: "09:00", end_time: "15:00"}, ...]
     *          Validasi + cek otorisasi (practitioner harus se-klinik) sudah dilakukan
     *          oleh SyncSchedulesRequest sebelum method ini berjalan.
     * Output : redirect kembali ke halaman form (Inertia lalu memuat ulang data terbaru).
     *
     * Proses (semuanya dalam 1 transaksi: berhasil semua atau batal semua):
     *  1. HAPUS jadwal hari-hari yang tidak ada di kiriman (artinya hari itu dimatikan/libur).
     *  2. Untuk tiap hari yang dikirim: UPDATE jika sudah ada, atau BUAT baru jika belum.
     */
    public function update(SyncSchedulesRequest $request, Practitioner $practitioner): RedirectResponse
    {
        // Hanya data yang lolos validasi (bukan input mentah)
        $days = $request->validated('schedules');

        // Transaksi: kalau di tengah jalan error, penghapusan di langkah 1 ikut dibatalkan,
        // jadi jadwal tidak pernah tersisa setengah-berubah.
        DB::transaction(function () use ($practitioner, $days) {
            // Decision #1: days not sent are switched off. (whereNotIn on an
            // empty list matches every row, which is what "all off" means.)
            // Langkah 1: hapus hari yang tidak dikirim.
            // Contoh: DB punya Sen, Rab, Jum; form kirim Sen & Rab -> Jum dihapus.
            // Form kirim [] -> semua hari dihapus (practitioner libur seminggu).
            $practitioner->schedules()
                ->whereNotIn('day_of_week', collect($days)->pluck('day_of_week'))
                ->delete();

            // Langkah 2: simpan tiap hari yang dikirim
            foreach ($days as $day) {
                // updateOrCreate(cari_dengan, isi_dengan):
                // cari jadwal practitioner ini di hari tsb -> ada: ubah jamnya, tidak ada: buat baru.
                // Efeknya tidak pernah ada 2 baris untuk hari yang sama.
                $practitioner->schedules()->updateOrCreate(
                    ['day_of_week' => $day['day_of_week']],
                    [
                        // Decision #5: one stored format.
                        // Form boleh kirim "09:00" atau "09:00:00"; di DB selalu disimpan "09:00:00"
                        'start_time' => Carbon::parse($day['start_time'])->format('H:i:s'),
                        'end_time' => Carbon::parse($day['end_time'])->format('H:i:s'),
                    ],
                );
            }
        });

        // Kembali ke halaman sebelumnya (form jadwal); Inertia akan menampilkan data terbaru
        return back();
    }
}
