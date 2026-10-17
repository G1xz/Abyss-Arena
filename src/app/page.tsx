import Link from "next/link";
import { ArrowRight, Ban, Layers, Scale, Timer } from "lucide-react";
import { CharacterIcon } from "@/components/character-card";
import { BrandLogo } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { getCurrentCycle } from "@/server/abyss/service";

const steps = [
  { icon: Layers, title: "Monte seu deck", text: "Importe seus personagens do HoYoLAB. O custo depende da constelação (e do nível nos 5★); monte o deck com até 1000 pontos." },
  { icon: Ban, title: "Bans e picks ao vivo", text: "Desafie alguém pelo nickname. Na sala, cada jogador bane do deck rival e escolhe 8 personagens (dois times de 4) em serpente." },
  { icon: Timer, title: "Speedrun no Abismo", text: "Joguem as mesmas câmaras do Abismo Espiral no Genshin. Menor tempo total, confirmado pelos dois, vence." },
  { icon: Scale, title: "Balanceamento vivo", text: "Pick, ban e win rate geram propostas de preço revisadas por administradores a cada semana." },
];

export default async function HomePage() {
  const [user, matches, players, characters, version, cycle, showcase] = await Promise.all([
    getCurrentUser(),
    prisma.match.count({ where: { status: "COMPLETED" } }),
    prisma.user.count(),
    prisma.character.count({ where: { competitiveEnabled: true } }),
    prisma.priceVersion.findFirst({ where: { status: "ACTIVE" }, select: { number: true } }),
    getCurrentCycle(),
    prisma.character.findMany({ where: { rarity: 5, competitiveEnabled: true }, orderBy: { releasedAt: "desc" }, take: 10 }),
  ]);

  return (
    <div>
      <section className="mx-auto grid max-w-7xl items-center gap-10 overflow-x-clip px-4 pt-14 pb-16 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
        <div>
          <BrandLogo height={196} eager className="-ml-2 mb-6 w-full max-w-[588px]" />
          <p className="mb-3 text-xs font-semibold tracking-[0.25em] text-gold uppercase">Draft competitivo · Genshin Impact</p>
          <h1 className="text-3xl leading-tight font-bold sm:text-4xl">
            Bans, picks e speedrun
            <br />
            <span className="bg-gradient-to-r from-[oklch(0.78_0.13_262)] via-primary to-[oklch(0.74_0.17_305)] bg-clip-text text-transparent">no Abismo Espiral.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground">
            Desafie jogadores para um X1, faça o draft em tempo real e registre quem limpou as câmaras mais rápido. A plataforma
            coordena o draft e os resultados; o combate acontece no seu jogo.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {user ? (
              <>
                <Button asChild size="lg">
                  <Link href="/play">
                    Desafiar jogador <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/decks">Meus decks</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link href="/register">
                    Começar agora <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/stats">Ver estatísticas</Link>
                </Button>
              </>
            )}
          </div>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
            {[
              ["Partidas", matches],
              ["Jogadores", players],
              ["Personagens", characters],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-card/60 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-display text-2xl font-bold tabular">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative">
          <div className="absolute -inset-6 rounded-3xl bg-primary/10 blur-3xl" aria-hidden />
          <div className="relative rounded-2xl border bg-card/80 p-5 shadow-2xl backdrop-blur">
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="font-display font-semibold">{cycle?.name ?? "Ciclo do Abismo"}</span>
              <span className="text-muted-foreground">Tabela de preços v{version?.number ?? "—"}</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {showcase.map((c) => (
                <CharacterIcon key={c.id} character={c} size={64} className="aspect-square size-full" />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-ban/40 bg-ban/10 px-3 py-2 text-ban">2 bans por jogador</div>
              <div className="rounded-md border border-pick/40 bg-pick/10 px-3 py-2 text-pick">8 picks em serpente</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-xl border bg-card/70 p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary">
                  <s.icon className="size-5" />
                </span>
                <span className="font-display text-sm text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
