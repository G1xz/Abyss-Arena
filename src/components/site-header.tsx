import Link from "next/link";
import { Orbit } from "lucide-react";
import type { SessionUser } from "@/server/auth/session";
import { InviteInbox } from "./invite-inbox";
import { MainNav, UserMenu } from "./nav-client";
import { Button } from "./ui/button";

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 font-display text-lg font-bold tracking-wide">
      <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-[oklch(0.55_0.17_250)] text-white shadow-[0_0_20px_-6px_var(--primary)]">
        <Orbit className="size-[18px]" strokeWidth={2.4} />
      </span>
      <span className="hidden sm:inline">
        Abyss<span className="text-primary">Arena</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
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
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Projeto de fãs, sem afiliação com a HoYoverse. As partidas acontecem dentro do Genshin Impact.</p>
        <p>Dados de personagens: Project Amber (gi.yatta.moe)</p>
      </div>
    </footer>
  );
}
