"use client";

import { useStage, type BoardMode } from "./StageContext";

// Papan jadwal praktek: objek tetap di setengah layar kiri.
// Isinya contoh (dokter dan jam fiktif) dan berganti mengikuti langkah cerita.
const DAYS = [
  { label: "Senin", time: "08.00–14.00" },
  { label: "Selasa", time: "08.00–14.00" },
  { label: "Rabu", time: "15.00–20.00" },
  { label: "Kamis", time: "08.00–14.00" },
  { label: "Jumat", time: "08.00–11.30" },
  { label: "Sabtu", time: null },
  { label: "Minggu", time: null },
] as const;

const SLOTS = [
  "08.00", "08.30", "09.00", "09.30", "10.00", "10.30", "11.00", "11.30",
] as const;
// Slot yang sudah dipesan pasien lain sejak awal.
const TAKEN_AT_START = new Set(["08.30", "09.30", "11.00"]);

// Panel di bawah papan: berganti isi sesuai langkah. Dipakai di papan (desktop)
// dan, di ponsel, disisipkan langsung di bawah tiap langkah cerita.
export function BoardPanel({ mode }: { mode: BoardMode }) {
  const { mine, take } = useStage();
  const takenCount = TAKEN_AT_START.size + mine.length;
  const lastMine = mine[mine.length - 1];

  return (
    <div aria-live="polite">
      {mode === "slot" ? (
        <>
          <h3 className="board__panel-title">Senin, pilih satu jam</h3>
          <ul className="board__slots">
            {SLOTS.map((t) => {
              const isMine = mine.includes(t);
              const taken = TAKEN_AT_START.has(t) || isMine;
              return (
                <li key={t}>
                  <button
                    type="button"
                    className="slot"
                    disabled={taken}
                    data-mine={isMine}
                    onClick={() => take(t)}
                    aria-label={taken ? `Pukul ${t}, sudah terisi` : `Pesan pukul ${t}`}
                  >
                    <b>{t}</b>
                    <span>{isMine ? "Anda" : taken ? "Terisi" : "Kosong"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="board__note">
            {lastMine ? (
              <>
                Pukul <strong>{lastMine}</strong> terpesan dan hilang dari pilihan.{" "}
              </>
            ) : null}
            {takenCount} dari {SLOTS.length} slot terisi.
          </p>
        </>
      ) : mode === "cuti" ? (
        <>
          <h3 className="board__panel-title">Kamis ditutup</h3>
          <p className="board__note">
            Tidak ada slot yang muncul di hari cuti.{" "}
            <strong>2 booking aktif bentrok</strong> dengan blokir ini dan perlu
            dihubungi.
          </p>
        </>
      ) : (
        <>
          <h3 className="board__panel-title">Tujuh hari, jam sendiri-sendiri</h3>
          <p className="board__note">Contoh jadwal. Hari tanpa jam dianggap libur.</p>
        </>
      )}
    </div>
  );
}

export function Board() {
  const { mode } = useStage();

  return (
    <div className="board" data-mode={mode}>
      <h2 className="board__title">Jadwal praktek</h2>
      <p className="board__doctor">dr. Sari Wulandari, dokter umum</p>

      <ul className="board__rows">
        {DAYS.map((d) => {
          const active = mode === "slot" && d.label === "Senin";
          const blocked = mode === "cuti" && d.label === "Kamis";
          return (
            <li
              key={d.label}
              className="board__row"
              data-active={active}
              data-blocked={blocked}
            >
              <span className="board__day">{d.label}</span>
              {blocked ? (
                <span className="board__tag">Cuti</span>
              ) : d.time ? (
                <span className="board__time">{d.time}</span>
              ) : (
                <span className="board__off">Libur</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="board__panel">
        <BoardPanel mode={mode} />
      </div>
    </div>
  );
}
