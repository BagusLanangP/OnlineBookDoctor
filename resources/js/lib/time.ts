export const MINUTES_PER_DAY = 24 * 60;

/** "09:30" (or "09:30:00") -> 570. Returns null for an empty or malformed value. */
export function toMinutes(time: string): number | null {
    const match = /^(\d{2}):(\d{2})/.exec(time);
    if (!match) return null;

    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return minutes <= MINUTES_PER_DAY ? minutes : null;
}

/** 450 -> "7 h 30 m", 480 -> "8 h", 0 -> "0 h" */
export function formatDuration(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (minutes === 0) return `${hours} h`;
    return hours === 0 ? `${minutes} m` : `${hours} h ${minutes} m`;
}
