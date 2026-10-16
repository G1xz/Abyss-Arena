import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const [adm, usr] = readFileSync(".local/tokens.txt", "utf8").trim().split("\n");
const out = process.argv[2];
const browser = await chromium.launch();
async function shot(token: string | null, path: string, name: string, width = 1366) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  if (token) await ctx.addCookies([{ name: "aa_session", value: token.trim(), url: "http://localhost:3000" }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://localhost:3000" + path, { waitUntil: "networkidle" });
  await page.screenshot({ path: out + "/" + name + ".png", fullPage: false });
  if (errors.length) console.log(name, "ERRORS:", errors.slice(0, 3));
  await ctx.close();
}
await shot(null, "/", "landing");
await shot(usr, "/decks/new", "builder");
await shot(usr, "/stats", "stats");
await shot(adm, "/admin/prices", "admin-prices");
await shot(usr, "/dashboard", "dashboard-mobile", 390);
await browser.close();
