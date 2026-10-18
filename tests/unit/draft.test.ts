import { describe, expect, it } from "vitest";
import {
  buildSequence,
  canUndo,
  clockRemainingMs,
  computeDraftState,
  DEFAULT_IMMUNITY,
  describeDraftFormat,
  effectiveSequence,
  formatClock,
  formatOrder,
  immunityEligible,
  minDeckSize,
  parseSequence,
  validateDraftAction,
  validateDraftConfig,
  type DraftActionRecord,
  type DraftConfig,
  type DraftCopies,
  type DraftDecks,
  type DraftPreset,
  type Seat,
} from "@/domain/draft";

/** Formato competitivo: imunidade → 3 bans (A-B-B-A-A-B) → 8 picks em serpente. */
const config: DraftConfig = {
  bansPerPlayer: 3,
  picksPerPlayer: 8,
  sequence: buildSequence("BANS_FIRST_SNAKE", 3, 8),
  immunity: DEFAULT_IMMUNITY,
  clockSeconds: 300,
  undoPerPlayer: 1,
};

// s1 e s2 estão nos dois decks com a mesma constelação (elegíveis à imunidade); s3 e s4 não.
const decks: DraftDecks = {
  A: ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "s1", "s2", "s3", "s4"],
  B: ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "s1", "s2", "s3", "s4"],
};
const copies: DraftCopies = { A: { s1: 0, s2: 2, s3: 0, s4: 1 }, B: { s1: 0, s2: 2, s3: 1, s4: 3 } };

function draft(cfg = config, d = decks, c = copies) {
  let actions: DraftActionRecord[] = [];
  const attempt = (seat: Seat, characterId: string | null) => validateDraftAction(cfg, d, actions, { actorSeat: seat, stepIndex: actions.length, characterId }, c);
  const play = (seat: Seat, characterId: string | null) => {
    const r = attempt(seat, characterId);
    if (!r.ok) throw new Error(`${seat} ${characterId}: ${r.message}`);
    actions = [...actions, { stepIndex: actions.length, type: r.type, actorSeat: seat, targetSeat: r.targetSeat, characterId }];
  };
  return { attempt, play, state: () => computeDraftState(cfg, d, actions, c), actions: () => actions };
}

describe("formato e sequência", () => {
  it("bans A-B-B-A-A-B e picks em serpente A-B-B-A ×4", () => {
    expect(formatOrder(config.sequence.filter((s) => s.type === "BAN"))).toBe("A → B → B → A → A → B");
    expect(formatOrder(config.sequence.filter((s) => s.type === "PICK"))).toBe(Array(4).fill("A → B → B → A").join(" → "));
    expect(validateDraftConfig(config)).toEqual([]);
  });

  it.each(["BANS_FIRST_ALTERNATE", "BANS_FIRST_SNAKE", "INTERLEAVED"] as DraftPreset[])("preset %s gera contagens corretas", (preset) => {
    for (const [bans, picks] of [
      [3, 8],
      [2, 4],
      [1, 5],
      [0, 4],
    ]) {
      expect(validateDraftConfig({ bansPerPlayer: bans!, picksPerPlayer: picks!, sequence: buildSequence(preset, bans!, picks!) })).toEqual([]);
    }
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

  it("rejeita configurações inválidas", () => {
    expect(validateDraftConfig({ bansPerPlayer: 2, picksPerPlayer: 4, sequence: parseSequence("BAN_A BAN_A BAN_B PICK_A PICK_B") }).length).toBeGreaterThan(0);
    expect(validateDraftConfig({ ...config, immunity: { ...DEFAULT_IMMUNITY, pickSlots: [4, 9] } })).toContain("Os picks dos imunes devem estar entre 1 e 8.");
    expect(validateDraftConfig({ ...config, sequence: [{ type: "IMMUNE", actor: "A" }, ...config.sequence] }).join(" ")).toMatch(/imunidade é automática/);
  });

  it("tamanho mínimo do deck = picks + bans recebidos", () => {
    expect(minDeckSize(config)).toBe(11);
  });

  it("resumo do formato para os jogadores", () => {
    expect(describeDraftFormat(config).join(" ")).toMatch(/Imunidade.*4º ou 8º.*3 bans por jogador.*8 picks por jogador.*300 s.*1 desfazer/);
  });
});

describe("imunidade", () => {
  it("elegíveis: nos dois decks e com a mesma constelação", () => {
    expect(immunityEligible(decks, copies)).toEqual(["s1", "s2"]);
  });

  it("só acontece com 2+ elegíveis e com a fase ativa", () => {
    expect(effectiveSequence(config, ["s1", "s2"]).sequence.slice(0, 3)).toEqual([
      { type: "IMMUNE", actor: "A" },
      { type: "IMMUNE", actor: "B" },
      { type: "BAN", actor: "A" },
    ]);
    expect(effectiveSequence(config, ["s1"]).immunityActive).toBe(false);
    expect(effectiveSequence({ ...config, immunity: { ...DEFAULT_IMMUNITY, enabled: false } }, ["s1", "s2"]).immunityActive).toBe(false);
  });

  it("os dois imunes são diferentes e precisam ser elegíveis", () => {
    const d = draft();
    expect(d.attempt("A", "s3")).toMatchObject({ ok: false, message: expect.stringMatching(/mesma constelação/) });
    d.play("A", "s1");
    expect(d.attempt("B", "s1")).toMatchObject({ ok: false, message: expect.stringMatching(/já foi declarado imune/) });
    d.play("B", "s2");
    expect(d.state().immune).toEqual({ A: "s1", B: "s2" });
  });
});

describe("draft completo com as regras competitivas", () => {
  it("imunidade, bans universais, picks exclusivos, imune no 4º/8º pick e passe sem opções", () => {
    const d = draft();
    d.play("A", "s1");
    d.play("B", "s2");

    // Bans: alvo no deck do oponente, imune não pode ser banido.
    expect(d.attempt("A", "a1")).toMatchObject({ ok: false, message: "Esse personagem não está no deck do oponente." });
    expect(d.attempt("A", "s2")).toMatchObject({ ok: false, message: "Personagens imunes não podem ser banidos." });
    d.play("A", "b1");
    d.play("B", "a1");
    d.play("B", "s3"); // s3 também está no deck de B: o ban vale para os dois
    expect(d.attempt("A", "b1")).toMatchObject({ ok: false, message: "Esse personagem já foi banido." });
    d.play("A", "b2");
    d.play("A", "b3");
    d.play("B", "a2");
    expect(d.state().banned).toEqual(["b1", "b2", "b3", "a1", "s3", "a2"]);

    // Picks: imune fora do 4º/8º pick é recusado; personagens comuns são exclusivos.
    expect(d.attempt("A", "s1")).toMatchObject({ ok: false, message: "Imunes só podem ser escolhidos no 4º ou 8º pick." });
    d.play("A", "s4");
    expect(d.attempt("B", "s4")).toMatchObject({ ok: false, message: "O oponente já escolheu esse personagem." });
    expect(d.attempt("B", "s3")).toMatchObject({ ok: false, message: "Esse personagem foi banido." });
    d.play("B", "b4");
    d.play("B", "b5");
    d.play("A", "a3");
    d.play("A", "a4");
    d.play("B", "b6");
    expect(d.state().pickNumber).toBe(4);
    d.play("B", "s1"); // 4º pick de B: imune liberado
    d.play("A", "s1"); // o mesmo imune vale para os dois
    d.play("A", "a5");
    d.play("B", "b7");
    d.play("B", "b8");
    d.play("A", "a6");
    d.play("A", "a7");

    // 7º pick de B: tudo banido, escolhido ou imune fora da janela → só resta passar.
    expect(d.state().options).toEqual([]);
    expect(d.attempt("B", "s2")).toMatchObject({ ok: false });
    d.play("B", null);
    d.play("B", "s2"); // 8º pick de B: imune
    expect(d.attempt("A", null)).toMatchObject({ ok: false, message: "Você ainda tem opções válidas neste turno." });
    d.play("A", "a8");

    const s = d.state();
    expect(s.isComplete).toBe(true);
    expect(s.totalSteps).toBe(24);
    expect(s.picks.A).toEqual(["s4", "a3", "a4", "s1", "a5", "a6", "a7", "a8"]);
    expect(s.picks.B).toEqual(["b4", "b5", "b6", "s1", "b7", "b8", "s2"]);
    expect(s.bans).toEqual({ A: ["b1", "b2", "b3"], B: ["a1", "s3", "a2"] });
    expect(s.bannedFrom).toEqual({ A: ["a1", "s3", "a2"], B: ["b1", "b2", "b3"] });
    expect(s.skipped).toEqual({ A: 0, B: 1 });
  });

  it("sem imunidade, o draft começa pelos bans e os picks 4 e 8 são normais", () => {
    const onlyOne: DraftCopies = { A: { s1: 0, s2: 1, s3: 0, s4: 0 }, B: { s1: 0, s2: 2, s3: 1, s4: 1 } };
    const d = draft(config, decks, onlyOne);
    expect(d.state().immunityActive).toBe(false);
    expect(d.state().currentStep).toEqual({ type: "BAN", actor: "A" });
    expect(d.state().totalSteps).toBe(22);
    d.play("A", "s1"); // sem imunidade, s1 pode ser banido
    expect(d.state().banned).toEqual(["s1"]);
  });

  it("rejeita ação fora do turno, atrasada e depois do fim", () => {
    const d = draft();
    expect(d.attempt("B", "s1")).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });
    d.play("A", "s1");
    expect(validateDraftAction(config, decks, d.actions(), { actorSeat: "A", stepIndex: 0, characterId: "s2" }, copies)).toMatchObject({
      ok: false,
      code: "STALE_ACTION",
    });
    const tiny: DraftConfig = { bansPerPlayer: 0, picksPerPlayer: 1, sequence: parseSequence("PICK_A PICK_B") };
    const done: DraftActionRecord[] = [
      { stepIndex: 0, type: "PICK", actorSeat: "A", targetSeat: "A", characterId: "a1" },
      { stepIndex: 1, type: "PICK", actorSeat: "B", targetSeat: "B", characterId: "b1" },
    ];
    expect(validateDraftAction(tiny, decks, done, { actorSeat: "A", stepIndex: 2, characterId: "a2" })).toMatchObject({ ok: false, code: "DRAFT_COMPLETE" });
  });

  it("não permite banir um personagem já escolhido (drafts intercalados)", () => {
    const interleaved: DraftConfig = { bansPerPlayer: 1, picksPerPlayer: 1, sequence: parseSequence("PICK_A PICK_B BAN_B BAN_A") };
    const d = draft(interleaved, decks, copies);
    d.play("A", "a1");
    d.play("B", "b1");
    expect(d.attempt("B", "a1")).toMatchObject({ ok: false, message: "Não é possível banir um personagem já escolhido." });
    expect(d.attempt("B", "a2")).toMatchObject({ ok: true });
  });
});

describe("desfazer e relógio", () => {
  it("desfaz só o último pick do próprio jogador, enquanto for a última ação, e só uma vez", () => {
    const d = draft();
    for (const [seat, id] of [
      ["A", "s1"],
      ["B", "s2"],
      ["A", "b1"],
      ["B", "a1"],
      ["B", "a2"],
      ["A", "b2"],
      ["A", "b3"],
      ["B", "a3"],
    ] as [Seat, string][])
      d.play(seat, id);
    expect(canUndo(config, d.actions(), "A", 0)).toBe(false); // última ação é um ban
    d.play("A", "a4");
    expect(canUndo(config, d.actions(), "A", 0)).toBe(true);
    expect(canUndo(config, d.actions(), "B", 0)).toBe(false);
    expect(canUndo(config, d.actions(), "A", 1)).toBe(false); // já usou
    d.play("B", "b4");
    expect(canUndo(config, d.actions(), "A", 0)).toBe(false); // o oponente já agiu
    expect(canUndo({ ...config, undoPerPlayer: 0 }, d.actions(), "B", 0)).toBe(false);
  });

  it("relógio de 300 s corre só no turno do jogador e fica negativo", () => {
    expect(clockRemainingMs(300_000, 0, null, 10_000)).toBe(300_000);
    expect(clockRemainingMs(300_000, 100_000, 1_000, 21_000)).toBe(180_000);
    expect(clockRemainingMs(300_000, 290_000, 0, 25_000)).toBe(-15_000);
    expect(formatClock(299_400)).toBe("4:59");
    expect(formatClock(5_000)).toBe("0:05");
    expect(formatClock(-12_000)).toBe("-0:12");
    expect(formatClock(-61_500)).toBe("-1:02");
    expect(formatClock(-3_903_000)).toBe("-1:05:03");
  });
});
