"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, History, Layers, LayoutDashboard, LogOut, Menu, Shield, Swords, Trophy, User, Users, X } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/overlays";

const links = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard, auth: true },
  { href: "/play", label: "Jogar", icon: Swords, auth: true },
  { href: "/roster", label: "Personagens", icon: Users, auth: true },
  { href: "/decks", label: "Decks", icon: Layers, auth: true },
  { href: "/ranking", label: "Ranking", icon: Trophy, auth: false },
  { href: "/stats", label: "Estatísticas", icon: BarChart3, auth: false },
];

export function MainNav({ loggedIn, isAdmin }: { loggedIn: boolean; isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = [...links.filter((l) => loggedIn || !l.auth), ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: Shield, auth: true }] : [])];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Principal">
        {visible.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
              isActive(l.href) && "text-foreground after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-primary",
            )}
          >
            <l.icon className="size-4" />
            {l.label}
          </Link>
        ))}
      </nav>
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={() => setOpen((v) => !v)}>
        {open ? <X /> : <Menu />}
      </Button>
      {open && (
        <div className="absolute inset-x-0 top-16 border-b bg-background/95 p-3 backdrop-blur lg:hidden">
          <nav className="grid gap-1" aria-label="Principal (móvel)">
            {visible.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={cn("flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm", isActive(l.href) ? "bg-accent text-foreground" : "text-muted-foreground")}
              >
                <l.icon className="size-4" />
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}

export function UserMenu({ nickname, isAdmin }: { nickname: string; isAdmin: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex max-w-44 items-center gap-2 rounded-full border border-border/70 bg-card/60 py-1 pr-3 pl-1 text-sm transition-colors hover:bg-accent/60"
          data-testid="user-menu"
        >
          <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-primary/80 to-[oklch(0.55_0.17_250)] text-xs font-bold text-white uppercase">
            {nickname.slice(0, 1)}
          </span>
          <span className="truncate font-medium">{nickname}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-muted-foreground">{nickname}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard /> Painel
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/players/${encodeURIComponent(nickname)}`}>
            <User /> Perfil público
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/history">
            <History /> Histórico
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <User /> Editar perfil
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield /> Administração
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logoutAction()} data-testid="logout">
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
