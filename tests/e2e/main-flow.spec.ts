import { expect, test, type Page } from "@playwright/test";
import { E2E } from "../../playwright.config";

/**
 * Fluxo principal com dois jogadores reais em navegadores (contextos) distintos e um administrador.
 * Cobre os 17 passos do critério de aceitação: contas, personagens importados do HoYoLAB, decks,
 * desafio direto por nickname, draft sincronizado, resultados, vencedor, ranking/métricas,
 * análise de balanceamento, aprovação, publicação e preservação do histórico.
 */

const run = Date.now().toString(36).slice(-5);
const PASSWORD = "senha-forte-123";
// 7× 4★ em C6 + 4× 5★ em C0 = 11 personagens (mínimo do formato). Custos da tabela inicial
// (Abyss Cup): deck A = 50 pontos, deck B = 68. Bennett e Xingqiu (C6) estão nos dois decks: há imunidade.
const A = {
  nick: `Alpha${run}`,
  email: `alpha${run}@e2e.local`,
  fours: ["Bennett", "Xingqiu", "Xiangling", "Sucrose", "Fischl", "Beidou", "Chongyun"],
  fives: ["Furina", "Nahida", "Neuvillette", "Kaedehara Kazuha"],
};
const B = {
  nick: `Bravo${run}`,
  email: `bravo${run}@e2e.local`,
  fours: ["Kuki Shinobu", "Yunjin", "Diona", "Rosaria", "Chevreuse", "Bennett", "Xingqiu"],
  fives: ["Yelan", "Zhongli", "Shenhe", "Xiao"],
};
const snake = (n: number) => Array.from({ length: n }, (_, i) => (Math.floor((i + 1) / 2) % 2 === 0 ? "A" : "B"));
// Imunidade A-B, 3 bans por jogador (A-B-B-A-A-B) e 8 picks por jogador em serpente.
const SEQUENCE = ["A", "B", ...snake(6), ...snake(16)] as ("A" | "B")[];

/** Texto no formato copiado da página de personagens do HoYoLAB. */
function hoyolabText(who: typeof A) {
  return ["Novos Personagens", "Filtrar", ...who.fives.map((n) => `Nv.90\n\n${n}`), ...who.fours.map((n) => `Nv.80\n6\n${n}`), "Nv.90\n\nManequim", "11"].join("\n\n");
}

async function register(page: Page, who: typeof A) {
  await page.goto("/register");
  await page.getByLabel("E-mail").fill(who.email);
  await page.getByLabel("Nickname").fill(who.nick);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/roster/);
}

async function importRoster(page: Page, who: typeof A) {
  await page.getByTestId("roster-paste").fill(hoyolabText(who));
  await expect(page.getByTestId("roster-preview")).toContainText("11 personagens reconhecidos");
  await expect(page.getByTestId("roster-preview")).toContainText("1 ignorados");
  await page.getByTestId("roster-import").click();
  await expect(page.getByTestId("roster-grid").locator('[data-testid^="roster-char-"]')).toHaveCount(11);
}

async function buildDeck(page: Page, name: string, characters: string[], total: number) {
  await page.goto("/decks/new");
  await page.getByTestId("deck-name").fill(name);
  for (const character of characters) {
    await page.getByTestId("deck-search").fill(character);
    await page.locator('[data-testid^="builder-char-"]').filter({ hasText: character }).first().click();
  }
  await page.getByTestId("deck-search").fill("");
  await expect(page.getByTestId("deck-budget")).toContainText(String(total));
  await expect(page.getByTestId("deck-remaining")).toContainText(`${1000 - total} ponto(s) restantes`);
  await page.getByTestId("deck-save").click();
  await expect(page).toHaveURL(/\/decks$/);
  await expect(page.getByTestId("deck-card").filter({ hasText: name })).toContainText("válido");
}

/** Capturas para inspeção visual, só quando E2E_SHOTS_DIR estiver definido. */
async function shot(page: Page, name: string) {
  if (process.env.E2E_SHOTS_DIR) await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/${name}.png` });
}

/** Seleciona a primeira opção válida (o imune, quando a janela do 4º/8º pick abre) e confirma. */
async function act(page: Page) {
  const banner = page.getByTestId("turn-banner");
  await expect(banner).toHaveAttribute("data-my-turn", "true");
  const immune = page.locator('[data-option="true"][data-immune="true"]');
  await ((await immune.count()) ? immune : page.locator('[data-option="true"]')).first().click();
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

  // 3. Personagens importados do HoYoLAB (colar texto) e decks válidos dentro do orçamento.
  await importRoster(pageA, A);
  await importRoster(pageB, B);
  await buildDeck(pageA, "Deck Alpha", [...A.fours, ...A.fives], 50);
  await buildDeck(pageB, "Deck Bravo", [...B.fours, ...B.fives], 68);

  // 4. A desafia B pelo nickname (B está online: o convite chega em tempo real).
  await pageB.goto("/dashboard");
  await pageA.goto("/play");
  await pageA.getByTestId("player-search").fill(B.nick);
  await pageA.getByTestId(`challenge-${B.nick}`).first().click();
  await expect(pageA).toHaveURL(/\/rooms\/[A-Z0-9]{6}$/);
  const code = pageA.url().split("/").pop()!;
  await expect(pageA.getByTestId("connection-status")).toHaveAttribute("data-connected", "true");
  await expect(pageA.getByTestId("invite-status")).toContainText(B.nick);

  // 5. B aceita pelo sino de convites e cai na sala.
  await expect(pageB.getByTestId("invite-count")).toHaveText("1");
  await pageB.getByTestId("invite-inbox").click();
  await pageB.getByTestId("invite-accept").click();
  await expect(pageB).toHaveURL(new RegExp(`/rooms/${code}$`));
  await expect(pageA.getByTestId("seat-B")).toContainText(B.nick); // A vê B entrar em tempo real

  // 6. Prontidão dos dois e início do draft.
  await pageA.getByTestId("ready-toggle").click();
  await pageB.getByTestId("ready-toggle").click();
  await expect(pageA.getByTestId("seat-B-ready")).toBeVisible();
  await expect(pageA.getByTestId("start-draft")).toBeEnabled();
  await pageA.getByTestId("start-draft").click();
  await expect(pageB.getByTestId("match-room")).toHaveAttribute("data-status", "BANNING");

  // 7-9. Imunidade, bans e picks sincronizados, alternando entre os navegadores.
  await expect(pageA.getByTestId("turn-banner")).toContainText("declare um personagem imune");
  await expect(pageA.getByTestId("clock-A")).toContainText(/[45]:\d\d/);
  for (const [i, seat] of SEQUENCE.entries()) {
    const page = seat === "A" ? pageA : pageB;
    const other = seat === "A" ? pageB : pageA;
    if (i === 1) {
      // Jogador fora do turno não consegue agir.
      await expect(pageA.getByTestId("turn-banner")).toHaveAttribute("data-my-turn", "false");
    }
    if (i === 0) await shot(page, "draft-imunidade");
    if (i === 15) {
      await shot(page, "draft-pick4-imune"); // 4º pick de A: janela do imune
      // Tabuleiro e personagens para escolher cabem na tela (1280×720).
      const bottom = await page.evaluate(() => Math.max(...[...document.querySelectorAll('[data-testid^="deck-panel-"]')].map((p) => p.getBoundingClientRect().bottom)));
      expect(bottom).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
    await act(page);
    if (i < SEQUENCE.length - 1) await expect(other.getByTestId("turn-banner")).toContainText(`Passo ${i + 2}/${SEQUENCE.length}`);
  }
  await expect(pageA.getByTestId("match-room")).toHaveAttribute("data-status", "LOCKED");
  await expect(pageB.getByTestId("match-room")).toHaveAttribute("data-status", "LOCKED");
  await shot(pageA, "draft-travado");
  await expect(pageA.getByTestId("final-team-A").locator("img")).toHaveCount(8);
  await expect(pageB.getByTestId("final-team-B").locator("img")).toHaveCount(8);

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
  await expect(admin.getByTestId("proposal-row").first()).toBeVisible();

  // 15. Revisão em lote: todas vêm marcadas; o admin deixa só a primeira e aprova as selecionadas (vão para o rascunho).
  const row = admin.getByTestId("proposal-row").first();
  const characterName = (await row.getAttribute("data-character-name"))!;
  const oldCost = Number(await row.getAttribute("data-current"));
  const newCost = Number(await row.getAttribute("data-suggested"));
  expect(newCost).not.toBe(oldCost);
  await expect(admin.getByTestId("proposal-select-all")).toBeChecked();
  await admin.getByTestId("proposal-select-all").uncheck();
  await row.getByTestId("proposal-check").check();
  await admin.getByTestId("proposal-note").fill("Aprovado no teste E2E");
  await admin.getByTestId("proposal-approve-all").click();
  await expect(admin.getByTestId("draft-change").filter({ hasText: characterName })).toBeVisible();

  // 16. Publicação da nova tabela.
  await admin.getByTestId("publish-draft").click();
  await expect(admin.getByText("Nova tabela publicada")).toBeVisible();
  await admin.reload();
  await expect(admin.getByText("Tabela vigente v2")).toBeVisible();

  // 17. Histórico preservado: a partida mantém os custos congelados (50 e 68 pts),
  // enquanto os decks salvos já são avaliados com a nova tabela; a v1 continua consultável.
  await pageA.goto(matchUrl);
  await expect(pageA.getByText("(50 pts)")).toHaveCount(1);
  await expect(pageA.getByText("(68 pts)")).toHaveCount(1);
  const deckTotal = async (page: Page) => {
    await page.goto("/decks");
    const text = await page.getByTestId("deck-card").first().locator("span.font-display").first().textContent();
    return Number(text!.match(/\d+/)![0]);
  };
  // A proposta muda o custo base (C0): afeta os 5★ em C0 dos decks; os 4★ em C6 têm custo fixo na tabela.
  const withProposal = (fives: string[], total: number) => total + (fives.includes(characterName) ? newCost - oldCost : 0);
  expect(await deckTotal(pageA)).toBe(withProposal(A.fives, 50));
  expect(await deckTotal(pageB)).toBe(withProposal(B.fives, 68));
  await admin.goto("/admin/prices");
  await expect(admin.getByRole("link", { name: "v1" })).toBeVisible();
  await admin.getByRole("link", { name: "v2" }).click();
  await expect(admin.getByRole("row").filter({ hasText: characterName })).toContainText(String(newCost));

  await Promise.all([ctxA.close(), ctxB.close(), ctxAdmin.close()]);
});
