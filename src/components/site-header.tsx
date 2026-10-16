import Link from "next/link";
import type { SessionUser } from "@/server/auth/session";
import { MainNav, UserMenu } from "./nav-client";
import { Button } from "./ui/button";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
      <span className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-primary to-[oklch(0.55_0.18_250)] text-sm text-white shadow-[0_0_18px_-4px_var(--primary)]">
        A
      </span>
      <span>
        Abyss<span className="text-primary">Arena</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Logo />
        <MainNav loggedIn={Boolean(user)} isAdmin={user?.role === "ADMIN"} />
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <UserMenu nickname={user.nickname} isAdmin={user.role === "ADMIN"} />
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
    <footer className="mt-16 border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Abyss Arena é um projeto de fãs, sem afiliação com a HoYoverse. As partidas acontecem dentro do Genshin Impact.</p>
        <p>Dados de personagens: Project Amber (gi.yatta.moe).</p>
      </div>
    </footer>
  );
}
