import type { Seat } from "./draft";

export type TiePolicy = "DRAW" | "FIRST_SUBMITTED_WINS";

export interface SeatTime {
  timeMs: number;
  submittedAt: Date;
}

export type MatchDecision = { winnerSeat: Seat; isDraw: false } | { winnerSeat: null; isDraw: true };

/** Menor tempo válido vence. Empate exato segue a política configurada (padrão: empate). */
export function decideWinner(a: SeatTime, b: SeatTime, tiePolicy: TiePolicy): MatchDecision {
  if (a.timeMs < b.timeMs) return { winnerSeat: "A", isDraw: false };
  if (b.timeMs < a.timeMs) return { winnerSeat: "B", isDraw: false };
  if (tiePolicy === "FIRST_SUBMITTED_WINS" && a.submittedAt.getTime() !== b.submittedAt.getTime()) {
    return { winnerSeat: a.submittedAt < b.submittedAt ? "A" : "B", isDraw: false };
  }
  return { winnerSeat: null, isDraw: true };
}

/** "1:23.456" -> ms. Aceita também segundos com casas decimais ("83.456"). */
export function parseDuration(input: string): number | null {
  const value = input.trim().replace(",", ".");
  const m = /^(?:(\d+):)?(\d+(?:\.\d{1,3})?)$/.exec(value);
  if (!m) return null;
  const minutes = m[1] ? Number(m[1]) : 0;
  const seconds = Number(m[2]);
  if (m[1] && seconds >= 60) return null;
  return Math.round((minutes * 60 + seconds) * 1000);
}

export function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const secStr = seconds.toFixed(3).padStart(6, "0");
  return minutes > 0 ? `${minutes}:${secStr}` : `${seconds.toFixed(3)}s`;
}
