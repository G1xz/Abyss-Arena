import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  enemyKey,
  isBattleHardened,
  mainEntry,
  monsterBaseHp,
  monsterMechanics,
  monsterResistances,
  notableResistances,
  resolveEnemyHp,
  totalHp,
  type AbyssEnemy,
  type HpCurve,
  type YattaMonsterDetail,
} from "@/domain/abyss-enemy";

const curve = (JSON.parse(readFileSync(new URL("../fixtures/yatta-monster-curve-sample.json", import.meta.url), "utf8")) as { data: HpCurve }).data;
const details = JSON.parse(readFileSync(new URL("../fixtures/yatta-monster-details-sample.json", import.meta.url), "utf8")) as Record<string, YattaMonsterDetail>;

const BAPTIST = 22100501;
const STANDARD_BEARER = 22070101;
const DEFENDER = 22070301;

function enemy(id: number, wave: number, level: number): AbyssEnemy {
  const detail = details[id]!;
  return {
    name: String(id),
    nameEn: (detail as unknown as { route: string }).route,
    count: 1,
    wave,
    image: null,
    baseHp: monsterBaseHp(mainEntry(detail)!, level, curve),
  };
}

// 12-1, 2ª metade do ciclo de 2026-10-16 (nível 95): valores do jogo com multiplicador 4,75.
const lowerHalf = [enemy(BAPTIST, 1, 95), enemy(STANDARD_BEARER, 2, 95), enemy(DEFENDER, 2, 95)];

describe("HP dos inimigos do Abismo", () => {
  it("HP base = HP inicial × curva no nível da câmara (versão principal do inimigo)", () => {
    expect(lowerHalf.map((e) => Math.round(e.baseHp!))).toEqual([454_287, 227_143, 181_715]);
    expect(monsterBaseHp(mainEntry(details[BAPTIST]!)!, null, curve)).toBeNull();
    expect(monsterBaseHp(mainEntry(details[BAPTIST]!)!, 42, curve)).toBeNull();
  });

  it("com o multiplicador da metade, bate com o HP do jogo", () => {
    const resolved = resolveEnemyHp(lowerHalf, 4.75, null);
    expect(resolved.map((e) => [e.hp, e.hpSource])).toEqual([
      [2_157_861, "abyss"],
      [1_078_931, "abyss"],
      [863_145, "abyss"],
    ]);
    expect(totalHp(resolved)).toEqual({ hp: 4_099_937, openWorld: false });
  });

  it("sem multiplicador mostra o HP de mundo aberto; HP manual tem prioridade", () => {
    const archer: AbyssEnemy = { name: "Arqueiro", nameEn: "Battle-Hardened Chimeric Volkodlak Archer", count: 1, wave: 1, image: null, baseHp: null };
    const open = resolveEnemyHp([...lowerHalf, archer], null, null);
    expect(open.map((e) => e.hpSource)).toEqual(["openWorld", "openWorld", "openWorld", null]);
    expect(open[3]!.hp).toBeNull();
    expect(totalHp(open)).toBeNull();
    expect(totalHp(open.slice(0, 3))).toEqual({ hp: 454_287 + 227_143 + 181_715, openWorld: true });

    const manual = resolveEnemyHp([archer, lowerHalf[0]!], null, { [enemyKey(archer)]: 5_535_346 });
    expect(manual.map((e) => [e.hp, e.hpSource])).toEqual([
      [5_535_346, "manual"],
      [454_287, "openWorld"],
    ]);
    // HP do Abismo misturado com mundo aberto não soma.
    expect(totalHp(manual)).toBeNull();
    expect(totalHp(resolveEnemyHp([archer, lowerHalf[0]!], 4.75, { [enemyKey(archer)]: 5_535_346 }))).toEqual({ hp: 5_535_346 + 2_157_861, openWorld: false });
  });

  it("quantidade multiplica no total; quantidade desconhecida não soma", () => {
    const two = resolveEnemyHp([{ ...lowerHalf[1]!, count: 2 }], 4.75, null);
    expect(totalHp(two)).toEqual({ hp: 2 * 1_078_931, openWorld: false });
    expect(totalHp(resolveEnemyHp([{ ...lowerHalf[1]!, count: null }], 4.75, null))).toBeNull();
  });

  it("resistências em % e destaque só do que foge dos 10%", () => {
    const moonfly = monsterResistances(mainEntry(details[26301101]!)!);
    expect(moonfly).toEqual({ PYRO: 70, HYDRO: 10, ANEMO: 10, ELECTRO: 10, DENDRO: 70, CRYO: 10, GEO: 10, PHYSICAL: 10 });
    expect(notableResistances(moonfly)).toEqual([
      ["PYRO", 70],
      ["DENDRO", 70],
    ]);
    expect(notableResistances(monsterResistances(mainEntry(details[STANDARD_BEARER]!)!))).toEqual([
      ["PYRO", 30],
      ["PHYSICAL", 30],
    ]);
    expect(notableResistances(null)).toEqual([]);
  });

  it("mecânicas sem marcação de cor e com quebras de linha", () => {
    const lion = monsterMechanics(details[26310501]!);
    expect(lion).toHaveLength(1);
    expect(lion[0]).toContain("Trovejante e Ventania.\nQuando está em Trovejante");
    const bearer = monsterMechanics(details[STANDARD_BEARER]!);
    expect(bearer[0]).not.toMatch(/<\/?color/);
    expect(bearer[0]).toContain("atingirem personagens protegidos por um escudo");
  });

  it("variantes Battle-Hardened são reconhecidas", () => {
    expect(isBattleHardened("Battle-Hardened Elite Treasure Hoarder")).toBe(true);
    expect(isBattleHardened("Chimeric Winged Lion")).toBe(false);
  });
});
