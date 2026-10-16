import { expect, test, type Page } from "@playwright/test";
import { E2E } from "../../playwright.config";

/**
 * Fluxo principal com dois jogadores reais em navegadores (contextos) distintos e um administrador.
 * Cobre os 17 passos do critério de aceitação: contas, decks, sala, draft sincronizado, resultados,
 * vencedor, ranking/métricas, análise de balanceamento, aprovação, publicação e preservação do histórico.
 */

const run = Date.now().toString(36).slice(-5);
const PASSWORD = "senha-forte-123";
const A = { nick: `Alpha${run}`, email: `alpha${run}@e2e.local`, deck: ["Bennett", "Xingqiu", "Xiangling", "Sucrose", "Furina", "Nahida"] };
const B = { nick: `Bravo${run}`, email: `bravo${run}@e2e.local`, deck: ["Fischl", "Beidou", "Bennett", "Xingqiu", "Neuvillette", "Kaedehara Kazuha"] };
// Sequência padrão: bans A-B-B-A, picks alternados.
const SEQUENCE = ["A", "B", "B", "A", "A", "B", "A", "B", "A", "B", "A", "B"] as const;

async function register(page: Page, who: typeof A) {
  await page.goto("/register");
  await page.getByLabel("E-mail").fill(who.email);
  await page.getByLabel("Nickname").fill(who.nick);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/decks\/new/);
}

async function buildDeck(page: Page, name: string, characters: string[]) {
  await page.goto("/decks/new");
  await page.getByTestId("deck-name").fill(name);
  for (const character of characters) {
    await page.getByTestId("deck-search").fill(character);
    await page.locator('[data-testid^="builder-char-"]').filter({ hasText: character }).first().click();
  }
  await page.getByTestId("deck-search").fill("");
  await expect(page.getByTestId("deck-budget")).toContainText("76");
  await expect(page.getByTestId("deck-remaining")).toContainText("24 ponto(s) restantes");
  await page.getByTestId("deck-save").click();
  await expect(page).toHaveURL(/\/decks$/);
  await expect(page.getByTestId("deck-card").filter({ hasText: name })).toContainText("válido");
}

async function act(page: Page) {
  const banner = page.getByTestId("turn-banner");
  await expect(banner).toHaveAttribute("data-my-turn", "true");
  await page.locator('[data-state="bannable"], [data-state="pickable"]').first().click();
  await page.getByTestId("confirm-action").click();
}

test("fluxo competitivo completo", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxAdmin = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const admin = await ctxAdmin.newPage();

  // 1-2. Jogadores A e B criam contas.
  await register(pageA, A);
  await register(pageB, B);

  // 3. Decks válidos dentro do orçamento.
  await buildDeck(pageA, "Deck Alpha", A.deck);
  await buildDeck(pageB, "Deck Bravo", B.deck);

  // 4. A cria a sala.
  await pageA.goto("/rooms/new");
  await pageA.getByTestId("create-room-submit").click();
  await expect(pageA).toHaveURL(/\/rooms\/[A-Z0-9]{6}$/);
  const code = pageA.url().split("/").pop()!;
  await expect(pageA.getByTestId("connection-status")).toHaveAttribute("data-connected", "true");

  // 5. B entra com o código.
  await pageB.goto("/rooms/join");
  await pageB.getByTestId("join-room-code").fill(code);
  await pageB.getByTestId("join-room-submit").click();
  await expect(pageB).toHaveURL(new RegExp(`/rooms/${code}$`));
  await expect(pageA.getByTestId("seat-B")).toContainText(B.nick); // A vê B entrar em tempo real

  // 6. Prontidão dos dois e início do draft.
  await pageA.getByTestId("ready-toggle").click();
  await pageB.getByTestId("ready-toggle").click();
  await expect(pageA.getByTestId("seat-B-ready")).toBeVisible();
  await expect(pageA.getByTestId("start-draft")).toBeEnabled();
  await pageA.getByTestId("start-draft").click();
  await expect(pageB.getByTestId("match-room")).toHaveAttribute("data-status", "BANNING");

  // 7-9. Bans e picks sincronizados, alternando entre os navegadores.
  for (const [i, seat] of SEQUENCE.entries()) {
    const page = seat === "A" ? pageA : pageB;
    const other = seat === "A" ? pageB : pageA;
    if (i === 1) {
      // Jogador fora do turno não consegue agir.
      await expect(pageA.getByTestId("turn-banner")).toHaveAttribute("data-my-turn", "false");
    }
    await act(page);
    if (i < SEQUENCE.length - 1) await expect(other.getByTestId("turn-banner")).toContainText(`Passo ${i + 2}/12`);
  }
  await expect(pageA.getByTestId("match-room")).toHaveAttribute("data-status", "LOCKED");
  await expect(pageB.getByTestId("match-room")).toHaveAttribute("data-status", "LOCKED");
  await expect(pageA.getByTestId("final-team-A").locator("img")).toHaveCount(4);
  await expect(pageB.getByTestId("final-team-B").locator("img")).toHaveCount(4);

  // 10. Registro dos tempos.
  await pageA.getByTestId("time-input").fill("5:00.000");
  await pageA.getByTestId("submit-time").click();
  await expect(pageB.getByTestId("opponent-time")).toHaveText("5:00.000");
  await pageB.getByTestId("time-input").fill("5:30.250");
  await pageB.getByTestId("submit-time").click();
  await expect(pageA.getByTestId("opponent-time")).toHaveText("5:30.250");

  // 11. Confirmação bilateral.
  await pageA.getByTestId("confirm-opponent").click();
  await pageB.getByTestId("confirm-opponent").click();

  // 12. Vencedor identificado automaticamente nos dois navegadores.
  await expect(pageA.getByTestId("winner-text")).toHaveText(`Vitória de ${A.nick}`);
  await expect(pageB.getByTestId("winner-text")).toHaveText(`Vitória de ${A.nick}`);
  await pageA.getByRole("link", { name: "Ver resumo da partida" }).click();
  await expect(pageA).toHaveURL(/\/matches\//);
  const matchUrl = pageA.url();
  await expect(pageA.getByTestId("match-summary-title")).toHaveText(`Vitória de ${A.nick}`);

  // 13. Ranking e métricas atualizados.
  await pageB.goto("/ranking");
  const rows = pageB.getByTestId("ranking-table").locator("tbody tr");
  await expect(rows.first()).toContainText(A.nick);
  await expect(rows.nth(1)).toContainText(B.nick);
  await pageB.goto("/stats");
  await expect(pageB.getByText("Partidas validadas", { exact: true }).locator("..")).toContainText("1");

  // 14. Admin executa a análise de balanceamento (parâmetros sensíveis para amostra pequena).
  await admin.goto("/login");
  await admin.getByLabel("E-mail").fill(E2E.adminEmail);
  await admin.getByLabel("Senha").fill(E2E.adminPassword);
  await admin.getByRole("button", { name: "Entrar" }).click();
  await expect(admin).toHaveURL(/\/dashboard/);
  await admin.goto("/admin/settings");
  for (const [label, value] of [
    ["Amostra mínima (jogos)", "1"],
    ["Amostra mínima (oportunidades)", "1"],
    ["Força do prior (jogos)", "0"],
    ["Partidas p/ ciclo maduro", "1"],
    ["Limiar de ação", "0.1"],
  ] as const) {
    await admin.getByLabel(label).fill(value);
  }
  await admin.getByTestId("save-balance-settings").click();
  await expect(admin.getByText("Parâmetros salvos")).toBeVisible();

  await admin.goto("/admin/prices");
  await admin.getByTestId("run-analysis").click();
  await expect(admin.getByTestId("proposal-card").first()).toBeVisible();

  // 15. Aprovação de uma proposta (vai para o rascunho).
  const card = admin.getByTestId("proposal-card").first();
  const characterName = (await card.locator("p.font-semibold").first().textContent())!.trim();
  const [oldCost, newCost] = ((await card.locator("span.font-display").first().textContent()) ?? "").match(/\d+/g)!.map(Number);
  expect(newCost).not.toBe(oldCost);
  await card.getByTestId("proposal-note").fill("Aprovado no teste E2E");
  await card.getByTestId("proposal-approve").click();
  await expect(admin.getByTestId("draft-change").filter({ hasText: characterName })).toBeVisible();

  // 16. Publicação da nova tabela.
  await admin.getByTestId("publish-draft").click();
  await expect(admin.getByText("Nova tabela publicada")).toBeVisible();
  await admin.reload();
  await expect(admin.getByText("Tabela vigente v2")).toBeVisible();

  // 17. Histórico preservado: a partida mantém os custos congelados (76 pts nos dois decks),
  // enquanto os decks salvos já são avaliados com a nova tabela; a v1 continua consultável.
  await pageA.goto(matchUrl);
  await expect(pageA.getByText("(76 pts)")).toHaveCount(2);
  const deckTotal = async (page: Page) => {
    await page.goto("/decks");
    const text = await page.getByTestId("deck-card").first().locator("span.font-display").first().textContent();
    return Number(text!.match(/\d+/)![0]);
  };
  const totals = [await deckTotal(pageA), await deckTotal(pageB)];
  expect(totals.some((t) => t === 76 + (newCost! - oldCost!))).toBe(true);
  await admin.goto("/admin/prices");
  await expect(admin.getByRole("link", { name: "v1" })).toBeVisible();
  await admin.getByRole("link", { name: "v2" }).click();
  await expect(admin.getByRole("row").filter({ hasText: characterName })).toContainText(String(newCost));

  await Promise.all([ctxA.close(), ctxB.close(), ctxAdmin.close()]);
});
