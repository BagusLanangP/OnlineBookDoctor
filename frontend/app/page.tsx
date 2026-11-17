import { Board } from "@/components/Board";
import { LogoMark } from "@/components/Logo";
import { Reveal } from "@/components/Reveal";
import { Showcase } from "@/components/Showcase";
import { StageProvider } from "@/components/StageContext";
import { Step } from "@/components/Step";
import { ScheduleEditorFragment, TodayBookingsCard } from "@/components/ui";
import { LOGIN_URL } from "@/lib/config";

// Isi "Isi Praktika": dikelompokkan seperti daftar menu cetak.
const MENU = [
  {
    group: "Jadwal",
    items: [
      ["Jadwal mingguan", "7 hari", "Setiap dokter punya jam sendiri tiap hari."],
      ["Jam praktek", "5 menit", "Jam mulai dan selesai dalam kelipatan 5 menit."],
      ["Dokter", "banyak", "Satu klinik, beberapa dokter atau praktisi."],
    ],
  },
  {
    group: "Booking",
    items: [
      ["Slot kosong", "otomatis", "Dihitung dari jadwal, booking, dan waktu yang diblokir."],
      ["Satu slot", "1 pasien", "Booking ganda ditolak, hanya satu yang berhasil."],
      ["Status", "3", "Dikonfirmasi, selesai, atau batal."],
    ],
  },
  {
    group: "Klinik",
    items: [
      ["Hari ini", "satu layar", "Booking hari ini dan jadwal minggu ini."],
      ["Zona waktu", "per klinik", "Waktu lokal klinik, disimpan dalam UTC."],
      ["Blokir waktu", "cuti, libur", "Slot di jam yang diblokir ikut tertutup."],
    ],
  },
] as const;

// Kartu masuk melayang di atas alas biru, jadi bayangannya sah (dialog, bukan elemen diam).
const DIALOG = "bg-white p-8 shadow-xl sm:rounded-lg"; // taste-skill-ignore

const FAQ = [
  ["Siapa yang memakai Praktika?", "Pemilik dan staf klinik. Satu akun terhubung ke satu klinik, dan satu klinik bisa punya beberapa dokter atau praktisi."],
  ["Apakah pasien bisa memesan sendiri?", "Belum. Saat ini booking dibuat oleh akun klinik. Halaman pemesanan untuk pasien belum tersedia."],
  ["Apakah klinik bisa mendaftar sendiri?", "Belum. Pembuatan akun sudah ada, tetapi akun baru belum otomatis terhubung ke sebuah klinik, jadi klinik perlu dihubungkan ke akunnya lebih dulu."],
  ["Bagaimana kalau dua booking masuk di jam yang sama?", "Hanya satu yang berhasil. Yang lain menerima pesan bahwa slot baru saja terambil."],
  ["Berapa lama satu slot?", "30 menit. Slot terakhir selalu selesai tepat saat jam praktek berakhir, jadi tidak ada slot yang melewati jam tutup."],
  ["Bagaimana dengan zona waktu?", "Setiap klinik punya zona waktu sendiri. Slot dihitung dalam waktu lokal klinik, sedangkan waktunya disimpan dalam UTC."],
  ["Apa yang terjadi saat booking dibatalkan?", "Booking ditandai batal, tidak dihapus, dan jamnya kembali bisa dipesan."],
  ["Bisakah jam praktek berbeda tiap hari?", "Bisa. Tiap hari punya jam sendiri, dan hari yang tidak dicentang dianggap libur."],
  ["Data pasien apa yang disimpan?", "Nama, nomor telepon (8 sampai 15 digit), dan alasan kunjungan."],
] as const;

export default function Home() {
  return (
    <>
      <header className="topbar">
        <a className="topbar__brand" href="#atas" aria-label="Praktika, ke atas halaman">
          <LogoMark size={36} />
        </a>
        <nav className="topbar__links" aria-label="Utama">
          <a className="hide-sm" href="#cara-kerja">Cara kerja</a>
          <a className="hide-sm" href="#fitur">Fitur</a>
          <a className="hide-sm" href="#dashboard">Dashboard</a>
          <a className="hide-sm" href="#tanya-jawab">Tanya jawab</a>
          <a className="btn" href={LOGIN_URL}>Masuk</a>
        </nav>
      </header>

      <main id="atas">
        <StageProvider>
          <div className="stage">
            <div className="stage__board">
              <Board />
            </div>

            <div className="stage__col">
              <section className="hero" aria-labelledby="judul">
                <h1 id="judul" className="wordmark">
                  praktika
                  <span className="sr-only-text">
                    {" "}
                    : jadwal praktek dan booking klinik tanpa bentrok
                  </span>
                </h1>
                <p className="hero__lead">
                  Jam praktek dan janji temu klinik dalam satu papan, tanpa
                  dobel booking.
                </p>
                <div className="hero__actions">
                  <a className="btn" href={LOGIN_URL}>
                    Masuk ke dashboard
                  </a>
                  <a className="btn btn--tone" href="#cara-kerja">
                    Lihat cara kerja
                  </a>
                </div>
              </section>

              <section className="story" id="cara-kerja" aria-labelledby="cara-judul">
                <Reveal as="h2">
                  <span id="cara-judul">Dari jam praktek sampai pasien datang</span>
                </Reveal>

                <Step mode="jadwal">
                  <p>
                    <strong>Pertama, atur jam praktek.</strong> Setiap dokter
                    punya jadwal mingguannya sendiri. Centang hari praktek,
                    isi jam mulai dan selesai dalam kelipatan 5 menit, lalu
                    lihat bar 24 jam sebagai pratinjau sebelum menyimpan.
                  </p>
                  <div className="step__evidence">
                    <ScheduleEditorFragment />
                  </div>
                </Step>

                <Step mode="slot">
                  <p>
                    <strong>Lalu, terima janji temu.</strong> Praktika
                    menghitung slot 30 menit dari jadwal, dikurangi booking
                    yang sudah ada dan waktu yang diblokir. Satu slot hanya
                    untuk satu pasien: kalau dua booking masuk bersamaan,
                    yang kedua mendapat pesan bahwa slot baru saja terambil.
                    Coba pilih satu jam di papan.
                  </p>
                </Step>

                <Step mode="cuti">
                  <p>
                    <strong>Saat dokter berhalangan,</strong> blokir waktunya.
                    Slot di jam itu hilang dari pilihan, dan Praktika
                    menghitung berapa booking aktif yang bentrok dengan blokir
                    tersebut.
                  </p>
                </Step>

                <Step mode="jadwal" panel={false}>
                  <p>
                    <strong>Setiap pagi,</strong> buka dashboard. Booking hari
                    ini sudah berurutan berdasarkan jam, lengkap dengan nama
                    pasien, keperluan, dan statusnya.
                  </p>
                  <div className="step__evidence">
                    <TodayBookingsCard />
                  </div>
                </Step>
              </section>
            </div>
          </div>
        </StageProvider>

        <section className="features" id="fitur" aria-labelledby="fitur-judul">
          <Reveal className="sheet">
            <h2 id="fitur-judul">Isi Praktika</h2>
            {MENU.map((g) => (
              <div key={g.group}>
                <h3>{g.group}</h3>
                <ul>
                  {g.items.map(([name, value, desc]) => (
                    <li key={name}>
                      <div className="sheet__line">
                        <span>{name}</span>
                        <span className="sheet__leader" aria-hidden="true" />
                        <span className="sheet__value">{value}</span>
                      </div>
                      <p className="sheet__desc">{desc}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Reveal>
        </section>

        <div id="dashboard">
          <Showcase />
        </div>

        <section className="faq" id="tanya-jawab" aria-labelledby="faq-judul">
          <Reveal as="h2">
            <span id="faq-judul">Tanya jawab</span>
          </Reveal>
          <div className="faq__text">
            {FAQ.map(([q, a], i) => (
              <Reveal as="p" key={q} delay={Math.min(i, 4) * 60}>
                <strong>{q}</strong> {a}
              </Reveal>
            ))}
          </div>
        </section>

        <section className="closing" aria-labelledby="penutup-judul">
          <div className="closing__text">
            <Reveal as="h2">
              <span id="penutup-judul">
                Praktek
                <br />
                lebih tenang.
              </span>
            </Reveal>
            <Reveal as="p" className="closing__sentence" delay={80}>
              Pendaftaran klinik mandiri belum tersedia. Kalau klinik Anda
              sudah punya akun, masuk dari sini.
            </Reveal>
          </div>

          <Reveal className="closing__card" delay={120}>
            <div
              data-ui
              className={DIALOG}
              style={{ maxWidth: 440 }}
            >
              <p className="text-2xl font-semibold text-gray-900">
                Masuk ke Praktika
              </p>
              <p className="mt-2 text-base text-gray-600">
                Gunakan email dan kata sandi akun klinik Anda. Anda akan
                diarahkan ke halaman masuk Praktika.
              </p>
              <a className="btn mt-8 w-full" href={LOGIN_URL}>
                Buka halaman masuk
              </a>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="foot">
        <span>Jadwal dan booking klinik</span>
        <nav className="foot__links" aria-label="Kaki halaman">
          <a href="#cara-kerja">Cara kerja</a>
          <a href="#fitur">Fitur</a>
          <a href="#tanya-jawab">Tanya jawab</a>
          <a href={LOGIN_URL}>Masuk</a>
        </nav>
        <span className="foot__end">© 2026 Praktika</span>
      </footer>
    </>
  );
}
