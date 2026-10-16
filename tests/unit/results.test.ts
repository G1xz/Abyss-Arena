import { describe, expect, it } from "vitest";
import { decideWinner, formatDuration, parseDuration } from "@/domain/results";

const t = (timeMs: number, at = 0) => ({ timeMs, submittedAt: new Date(1_700_000_000_000 + at) });

describe("decisão do vencedor", () => {
  it("menor tempo vence", () => {
    expect(decideWinner(t(300_000), t(300_001), "DRAW")).toEqual({ winnerSeat: "A", isDraw: false });
    expect(decideWinner(t(310_000), t(300_000), "DRAW")).toEqual({ winnerSeat: "B", isDraw: false });
  });

  it("empate exato registra empate pela política padrão", () => {
    expect(decideWinner(t(300_000, 5), t(300_000, 1), "DRAW")).toEqual({ winnerSeat: null, isDraw: true });
  });

  it("política alternativa: vence quem enviou primeiro", () => {
    expect(decideWinner(t(300_000, 5), t(300_000, 1), "FIRST_SUBMITTED_WINS")).toEqual({ winnerSeat: "B", isDraw: false });
  });
});

describe("formato de tempo", () => {
  it("converte m:ss.mmm e segundos decimais", () => {
    expect(parseDuration("5:42.310")).toBe(342_310);
    expect(parseDuration("83.5")).toBe(83_500);
    expect(parseDuration("83,25")).toBe(83_250);
    expect(parseDuration("1:05")).toBe(65_000);
    expect(parseDuration("1:75")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
  });

  it("formata milissegundos", () => {
    expect(formatDuration(342_310)).toBe("5:42.310");
    expect(formatDuration(65_000)).toBe("1:05.000");
    expect(formatDuration(23_456)).toBe("23.456s");
  });
});
