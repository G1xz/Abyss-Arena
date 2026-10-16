import { describe, expect, it } from "vitest";
import {
  buildSequence,
  computeDraftState,
  formatSequence,
  minDeckSize,
  parseSequence,
  validateDraftAction,
  validateDraftConfig,
  type DraftActionRecord,
  type DraftConfig,
  type DraftDecks,
  type DraftPreset,
} from "@/domain/draft";

const config: DraftConfig = { bansPerPlayer: 2, picksPerPlayer: 4, sequence: buildSequence("BANS_FIRST_ALTERNATE", 2, 4) };
const decks: DraftDecks = { A: ["a1", "a2", "a3", "a4", "a5", "a6", "shared"], B: ["b1", "b2", "b3", "b4", "b5", "b6", "shared"] };

function apply(actions: DraftActionRecord[], actorSeat: "A" | "B", characterId: string) {
  const result = validateDraftAction(config, decks, actions, { actorSeat, stepIndex: actions.length, characterId });
  if (!result.ok) throw new Error(result.message);
  return [...actions, { stepIndex: actions.length, type: result.step.type, actorSeat, targetSeat: result.targetSeat, characterId }];
}

describe("sequência configurável do draft", () => {
  it("padrão: bans A-B-B-A e picks alternados", () => {
    expect(formatSequence(config.sequence)).toBe(
      "BAN_PLAYER_A, BAN_PLAYER_B, BAN_PLAYER_B, BAN_PLAYER_A, PICK_PLAYER_A, PICK_PLAYER_B, PICK_PLAYER_A, PICK_PLAYER_B, PICK_PLAYER_A, PICK_PLAYER_B, PICK_PLAYER_A, PICK_PLAYER_B",
    );
  });

  it.each(["BANS_FIRST_ALTERNATE", "BANS_FIRST_SNAKE", "INTERLEAVED"] as DraftPreset[])("preset %s gera contagens corretas", (preset) => {
    for (const [bans, picks] of [
      [2, 4],
      [3, 3],
      [1, 5],
      [0, 4],
    ]) {
      expect(validateDraftConfig({ bansPerPlayer: bans!, picksPerPlayer: picks!, sequence: buildSequence(preset, bans!, picks!) })).toEqual([]);
    }
  });

  it("intercalado não coloca todos os bans antes dos picks", () => {
    const seq = buildSequence("INTERLEAVED", 2, 4);
    const lastBan = seq.map((s) => s.type).lastIndexOf("BAN");
    const firstPick = seq.findIndex((s) => s.type === "PICK");
    expect(firstPick).toBeLessThan(lastBan);
  });

  it("parseSequence aceita formatos curtos e longos", () => {
    expect(parseSequence("BAN_A, ban_player_b\nPICK_A PICK_B")).toEqual([
      { type: "BAN", actor: "A" },
      { type: "BAN", actor: "B" },
      { type: "PICK", actor: "A" },
      { type: "PICK", actor: "B" },
    ]);
    expect(() => parseSequence("BAN_C")).toThrow(/inválido/);
  });

  it("rejeita sequência com número errado de bans/picks", () => {
    const errors = validateDraftConfig({ bansPerPlayer: 2, picksPerPlayer: 4, sequence: parseSequence("BAN_A BAN_A BAN_B PICK_A PICK_B") });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("tamanho mínimo do deck = picks + bans recebidos", () => {
    expect(minDeckSize(config)).toBe(6);
  });
});

describe("bans e picks", () => {
  it("executa um draft completo válido", () => {
    let actions: DraftActionRecord[] = [];
    actions = apply(actions, "A", "b1"); // A bane do deck de B
    actions = apply(actions, "B", "a1");
    actions = apply(actions, "B", "a2");
    actions = apply(actions, "A", "b2");
    actions = apply(actions, "A", "a3");
    actions = apply(actions, "B", "shared");
    actions = apply(actions, "A", "shared"); // mesmo personagem em times diferentes é permitido
    actions = apply(actions, "B", "b3");
    actions = apply(actions, "A", "a4");
    actions = apply(actions, "B", "b4");
    actions = apply(actions, "A", "a5");
    actions = apply(actions, "B", "b5");
    const state = computeDraftState(config, decks, actions);
    expect(state.isComplete).toBe(true);
    expect(state.picks.A).toEqual(["a3", "shared", "a4", "a5"]);
    expect(state.picks.B).toEqual(["shared", "b3", "b4", "b5"]);
    expect(state.bannedFrom).toEqual({ A: ["a1", "a2"], B: ["b1", "b2"] });
  });

  it("rejeita ação fora do turno", () => {
    const r = validateDraftAction(config, decks, [], { actorSeat: "B", stepIndex: 0, characterId: "a1" });
    expect(r).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });
  });

  it("rejeita ação atrasada/duplicada (passo desatualizado)", () => {
    const actions = apply([], "A", "b1");
    const r = validateDraftAction(config, decks, actions, { actorSeat: "A", stepIndex: 0, characterId: "b2" });
    expect(r).toMatchObject({ ok: false, code: "STALE_ACTION" });
  });

  it("ban só pode atingir o deck do oponente e não pode repetir", () => {
    expect(validateDraftAction(config, decks, [], { actorSeat: "A", stepIndex: 0, characterId: "a1" })).toMatchObject({ ok: false, code: "ILLEGAL_ACTION" });
    let actions = apply([], "A", "b1");
    actions = apply(actions, "B", "a1");
    expect(validateDraftAction(config, decks, actions, { actorSeat: "B", stepIndex: 2, characterId: "a1" })).toMatchObject({ ok: false, code: "ILLEGAL_ACTION" });
  });

  it("pick só do próprio deck, sem banidos e sem repetir", () => {
    let actions = apply([], "A", "b1");
    actions = apply(actions, "B", "a1");
    actions = apply(actions, "B", "a2");
    actions = apply(actions, "A", "b2");
    expect(validateDraftAction(config, decks, actions, { actorSeat: "A", stepIndex: 4, characterId: "b3" })).toMatchObject({ ok: false, code: "ILLEGAL_ACTION" });
    expect(validateDraftAction(config, decks, actions, { actorSeat: "A", stepIndex: 4, characterId: "a1" })).toMatchObject({ ok: false, code: "ILLEGAL_ACTION" });
    actions = apply(actions, "A", "a3");
    actions = apply(actions, "B", "b3");
    expect(validateDraftAction(config, decks, actions, { actorSeat: "A", stepIndex: 6, characterId: "a3" })).toMatchObject({ ok: false, code: "ILLEGAL_ACTION" });
  });

  it("não permite banir um personagem já escolhido (drafts intercalados)", () => {
    const interleaved: DraftConfig = { bansPerPlayer: 1, picksPerPlayer: 1, sequence: parseSequence("PICK_A PICK_B BAN_B BAN_A") };
    let actions: DraftActionRecord[] = [];
    const step = (seat: "A" | "B", id: string) => {
      const r = validateDraftAction(interleaved, decks, actions, { actorSeat: seat, stepIndex: actions.length, characterId: id });
      if (!r.ok) return r;
      actions = [...actions, { stepIndex: actions.length, type: r.step.type, actorSeat: seat, targetSeat: r.targetSeat, characterId: id }];
      return r;
    };
    step("A", "a1");
    step("B", "b1");
    expect(step("B", "a1")).toMatchObject({ ok: false, code: "ILLEGAL_ACTION" });
    expect(step("B", "a2")).toMatchObject({ ok: true });
  });

  it("rejeita ações após o fim do draft", () => {
    const tiny: DraftConfig = { bansPerPlayer: 0, picksPerPlayer: 1, sequence: parseSequence("PICK_A PICK_B") };
    const actions: DraftActionRecord[] = [
      { stepIndex: 0, type: "PICK", actorSeat: "A", targetSeat: "A", characterId: "a1" },
      { stepIndex: 1, type: "PICK", actorSeat: "B", targetSeat: "B", characterId: "b1" },
    ];
    expect(validateDraftAction(tiny, decks, actions, { actorSeat: "A", stepIndex: 2, characterId: "a2" })).toMatchObject({ ok: false, code: "DRAFT_COMPLETE" });
  });
});
