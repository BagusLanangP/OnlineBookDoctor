"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { BoardPanel } from "./Board";
import { useStage, type BoardMode } from "./StageContext";

// Satu langkah cerita. Saat berada di tengah layar, papan jadwal di sebelah kiri
// berganti ke keadaan yang sesuai dengan langkah ini.
export function Step({
  mode,
  children,
  panel = true,
}: {
  mode: BoardMode;
  children: ReactNode;
  panel?: boolean; // false: langkah ini tidak butuh panel kecil sendiri di ponsel
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { setMode } = useStage();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setMode(mode);
      },
      { rootMargin: "-42% 0px -42% 0px", threshold: 0 },
    );
    io.observe(el);

    const reveal = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.in = "true";
          reveal.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    reveal.observe(el);

    return () => {
      io.disconnect();
      reveal.disconnect();
    };
  }, [mode, setMode]);

  return (
    <div ref={ref} className="step reveal">
      {children}
      {/* Hanya di ponsel: papan di atas tidak menempel, jadi tiap langkah
          membawa panel kecilnya sendiri di tempatnya. */}
      {panel && (
        <div className="board board--inline step__panel">
          <BoardPanel mode={mode} />
        </div>
      )}
    </div>
  );
}
