import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/brand/logo.webp";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/server/auth/session";
import { InviteInbox } from "./invite-inbox";
import { MainNav, UserMenu } from "./nav-client";
import { Button } from "./ui/button";

export const BRAND = "Genshin Draft Arena";

/** Logo da marca. `height` em px; a largura acompanha a proporção da imagem (3:1). */
export function BrandLogo({ height, className, eager }: { height: number; className?: string; eager?: boolean }) {
  const width = Math.round((height * logo.width) / logo.height);
  return (
    <Image
      src={logo}
      alt={BRAND}
      width={width}
      height={height}
      sizes={`${width}px`}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      className={cn("h-auto max-w-full drop-shadow-[0_6px_24px_oklch(0.45_0.2_285/0.35)]", className)}
    />
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center" aria-label={`${BRAND}, página inicial`}>
      <BrandLogo height={52} eager className="h-9 w-auto sm:h-[52px]" />
    </Link>
  );
}

export function SiteHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-6">
        <Logo />
        <MainNav loggedIn={Boolean(user)} isAdmin={user?.role === "ADMIN"} />
        <div className="ml-auto flex items-center gap-1.5">
          {user ? (
            <>
              <InviteInbox />
              <UserMenu nickname={user.nickname} isAdmin={user.role === "ADMIN"} />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Entrar</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Criar conta</Link>
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="gold-rule h-px" aria-hidden />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20">
      <div className="gold-rule h-px" aria-hidden />
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <BrandLogo height={36} className="opacity-90" />
        <div className="grid gap-1 text-center sm:text-right">
          <p>Projeto de fãs, sem afiliação com a HoYoverse. As partidas acontecem dentro do Genshin Impact.</p>
          <p>Dados de personagens e inimigos: Project Amber (gi.yatta.moe) · Ciclos do Abismo: Genshin Impact Wiki (Fandom)</p>
        </div>
      </div>
    </footer>
  );
}
