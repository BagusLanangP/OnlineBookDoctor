"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { LOGIN_URL } from "@/lib/config";
import { Photo } from "./Photo";
import {
  PractitionersCard,
  TodayBookingsCard,
  WeekScheduleCard,
} from "./ui";

const TABS = [
  { id: "hari-ini", label: "Hari ini", node: <TodayBookingsCard /> },
  { id: "minggu-ini", label: "Minggu ini", node: <WeekScheduleCard /> },
  { id: "dokter", label: "Dokter", node: <PractitionersCard /> },
] as const;

// Dashboard klinik: pelat persegi di kiri (potongan antarmuka asli),
// teks hemat dan dua aksi di kanan. Tiga tab mengganti kartu yang ditampilkan.
export function Showcase() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <section className="showcase" aria-labelledby="dashboard-judul">
      <div className="showcase__plate">
        <Photo
          className="photo--drift"
          src="/img/ruang-tunggu.jpg"
          alt="Meja kayu dengan kursi-kursi putih di dekat jendela besar yang terang"
          width={1200}
          height={1200}
          sizes="(min-width: 1024px) 50vw, 100vw"
        />
        <div
          className="showcase__ui"
          role="tabpanel"
          id={`panel-${TABS[active].id}`}
          aria-labelledby={`tab-${TABS[active].id}`}
        >
          {TABS[active].node}
        </div>
      </div>

      <div className="showcase__text">
        <div role="tablist" aria-label="Isi dashboard" className="tabs">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={i === active}
              aria-controls={`panel-${t.id}`}
              tabIndex={i === active ? 0 : -1}
              className="tab"
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div>
          <h2 id="dashboard-judul" className="showcase__title">
            Satu layar untuk hari ini
          </h2>
          <p className="showcase__desc">
            Booking hari ini, jadwal minggu ini, dan daftar dokter klinik,
            terkumpul di dashboard.
          </p>
        </div>

        <div className="showcase__cells">
          <a className="cell" href={LOGIN_URL}>
            Masuk <span aria-hidden="true">→</span>
          </a>
          <a className="cell cell--tone" href="#cara-kerja">
            Lihat cara kerja <span aria-hidden="true">↑</span>
          </a>
        </div>
      </div>
    </section>
  );
}
