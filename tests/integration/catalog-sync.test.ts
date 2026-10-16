import { beforeEach, describe, expect, it } from "vitest";
import { CatalogUnavailableError, type CatalogCharacter, type CharacterCatalogProvider } from "@/server/catalog/provider";
import { syncCatalog } from "@/server/catalog/sync";
import { prisma } from "@/server/db";
import { publishInitialPriceVersion } from "@/server/pricing/service";
import { resetDb, snapshotCharacters } from "../support/factories";

function provider(source: string, characters: CatalogCharacter[] | Error): CharacterCatalogProvider {
  return {
    source,
    fetchCharacters: async () => {
      if (characters instanceof Error) throw characters;
      return { characters, skipped: [] };
    },
  };
}

const all = snapshotCharacters();
const sample = all.slice(0, 20);

describe("sincronização do catálogo", () => {
  beforeEach(resetDb);

  it("importa personagens desabilitados para competição e sem duplicatas", async () => {
    const report = await syncCatalog({ providers: [provider("yatta", sample)] });
    expect(report).toMatchObject({ source: "yatta", created: 20, updated: 0, markedMissing: 0 });
    const rows = await prisma.character.findMany();
    expect(rows).toHaveLength(20);
    expect(rows.every((r) => r.competitiveEnabled === false)).toBe(true);

    const again = await syncCatalog({ providers: [provider("yatta", sample)] });
    expect(again).toMatchObject({ created: 0, unchanged: 20 });
    expect(await prisma.character.count()).toBe(20);
  });

  it("atualiza atributos sem tocar em liberação ou preços", async () => {
    await syncCatalog({ providers: [provider("yatta", sample)] });
    const target = await prisma.character.findUniqueOrThrow({ where: { slug: sample[0]!.slug } });
    await prisma.character.update({ where: { id: target.id }, data: { competitiveEnabled: true } });
    const renamed = sample.map((c, i) => (i === 0 ? { ...c, name: "Nome Novo" } : c));
    const report = await syncCatalog({ providers: [provider("yatta", renamed)] });
    expect(report.updated).toBe(1);
    const after = await prisma.character.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.name).toBe("Nome Novo");
    expect(after.competitiveEnabled).toBe(true);
  });

  it("falha da API externa não apaga catálogo nem preços", async () => {
    await syncCatalog({ providers: [provider("yatta", sample)] });
    const chars = await prisma.character.findMany();
    await publishInitialPriceVersion(chars.map((c) => ({ characterId: c.id, cost: 10 })), { adminId: null });

    await expect(syncCatalog({ providers: [provider("yatta", new Error("HTTP 503")), provider("jmp", new Error("timeout"))] })).rejects.toBeInstanceOf(
      CatalogUnavailableError,
    );
    expect(await prisma.character.count()).toBe(20);
    expect(await prisma.characterPrice.count()).toBe(20);
    expect(await prisma.character.count({ where: { missingFromSource: true } })).toBe(0);
  });

  it("usa a fonte alternativa quando a primária falha, sem sobrescrever dados da primária", async () => {
    await syncCatalog({ providers: [provider("yatta", sample)] });
    const english = sample.map((c) => ({ ...c, name: `${c.name} (EN)`, externalId: c.slug }));
    const report = await syncCatalog({ providers: [provider("yatta", new Error("down")), provider("jmp", english)] });
    expect(report.source).toBe("jmp");
    expect(report.attempts).toHaveLength(1);
    const first = await prisma.character.findUniqueOrThrow({ where: { slug: sample[0]!.slug } });
    expect(first.name).toBe(sample[0]!.name);
    expect(first.externalSource).toBe("yatta");
  });

  it("sinaliza personagens ausentes sem apagá-los e protege contra respostas parciais", async () => {
    await syncCatalog({ providers: [provider("yatta", sample)] });
    const report = await syncCatalog({ providers: [provider("yatta", sample.slice(0, 18))] });
    expect(report.markedMissing).toBe(2);
    expect(await prisma.character.count()).toBe(20);

    const partial = await syncCatalog({ providers: [provider("yatta", sample.slice(0, 3))] });
    expect(partial.partialResponse).toBe(true);
    expect(partial.markedMissing).toBe(0);
  });
});
