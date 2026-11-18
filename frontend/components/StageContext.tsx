"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Tiga keadaan papan jadwal, mengikuti langkah cerita yang sedang dibaca.
export type BoardMode = "jadwal" | "slot" | "cuti";

const StageCtx = createContext<{
  mode: BoardMode;
  setMode: (mode: BoardMode) => void;
  mine: string[]; // jam yang sudah dipilih pengunjung di papan
  take: (time: string) => void;
}>({ mode: "jadwal", setMode: () => {}, mine: [], take: () => {} });

export function StageProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<BoardMode>("jadwal");
  const [mine, setMine] = useState<string[]>([]);
  const take = (time: string) =>
    setMine((m) => (m.includes(time) ? m : [...m, time]));
  return (
    <StageCtx.Provider value={{ mode, setMode, mine, take }}>
      {children}
    </StageCtx.Provider>
  );
}

export const useStage = () => useContext(StageCtx);
