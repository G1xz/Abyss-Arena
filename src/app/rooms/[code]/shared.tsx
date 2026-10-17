import type { Seat } from "@/domain/draft";
import { formatDuration } from "@/domain/results";
import type { MatchView } from "@/server/matches/view";
import type { EmitResult } from "@/lib/use-match-room";

export type Emit = (event: string, payload?: Record<string, unknown>) => Promise<EmitResult>;

export interface RoomContext {
  state: MatchView;
  mySeat: Seat | null;
  oppSeat: Seat | null;
  me: { id: string; nickname: string };
  emit: Emit;
  online: string[];
}

export function nick(state: MatchView, seat: Seat | null) {
  if (!seat) return "—";
  return state.players[seat]?.nickname ?? (seat === "B" ? "Oponente" : "Anfitrião");
}

export function describeEvent(e: MatchView["events"][number]): string {
  const p = e.payload ?? {};
  const who = e.actor ?? "Sistema";
  switch (e.type) {
    case "ROOM_CREATED":
      return `${who} criou a sala`;
    case "PLAYER_JOINED":
      return `${who} entrou na sala`;
    case "PLAYER_LEFT":
      return `${who} saiu da sala`;
    case "DECK_SELECTED":
      return `${who} selecionou o deck “${String(p.deckName ?? "")}”`;
    case "PLAYER_READY":
      return `${who} está pronto`;
    case "PLAYER_UNREADY":
      return `${who} cancelou a prontidão`;
    case "SEATS_SWAPPED":
      return `${who} trocou os lados (A ↔ B)`;
    case "DRAFT_STARTED":
      return `Draft iniciado (tabela v${String(p.priceVersion ?? "?")})${p.immunity ? " com fase de imunidade" : ""}`;
    case "DRAFT_IMMUNE":
      return `${who} declarou ${String(p.characterName ?? "")} imune`;
    case "DRAFT_BAN":
      return `${who} baniu ${String(p.characterName ?? "")}`;
    case "DRAFT_PICK":
      return `${who} escolheu ${String(p.characterName ?? "")}`;
    case "DRAFT_SKIP":
      return `${who} passou a vez (sem opções válidas)`;
    case "DRAFT_UNDO":
      return `${who} desfez o pick de ${String(p.characterName ?? "")}`;
    case "DRAFT_LOCKED":
      return "Times travados";
    case "RESULT_SUBMITTED":
      return `${who} enviou o tempo ${typeof p.timeMs === "number" ? formatDuration(p.timeMs) : ""}`;
    case "RESULT_UPDATED":
      return `${who} corrigiu o tempo para ${typeof p.timeMs === "number" ? formatDuration(p.timeMs) : ""}`;
    case "RESULT_CONFIRMED":
      return `${who} confirmou o tempo do oponente`;
    case "RESULT_DISPUTED":
      return `${who} contestou o resultado`;
    case "MATCH_COMPLETED":
      return p.isDraw ? "Partida concluída: empate" : `Partida concluída: vitória do jogador ${String(p.winnerSeat)}`;
    case "MATCH_VOIDED":
      return "Partida anulada pela administração";
    case "ROOM_CANCELLED":
      return "Sala cancelada";
    default:
      return e.type;
  }
}
