"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { History, LayoutDashboard, LogOut, Menu, Shield, User, X } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/overlays";

const links = [
  { href: "/dashboard", label: "Painel", auth: true },
  { href: "/rooms/new", label: "Jogar", auth: true },
  { href: "/decks", label: "Decks", auth: true },
  { href: "/ranking", label: "Ranking", auth: false },
  { href: "/stats", label: "Estatísticas", auth: false },
];

export function MainNav({ loggedIn, isAdmin }: { loggedIn: boolean; isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = [...links.filter((l) => loggedIn || !l.auth), ...(isAdmin ? [{ href: "/admin", label: "Admin", auth: true }] : [])];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
        {visible.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
              isActive(l.href) && "bg-accent text-foreground",
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu" onClick={() => setOpen((v) => !v)}>
        {open ? <X /> : <Menu />}
      </Button>
      {open && (
        <div className="absolute inset-x-0 top-14 border-b bg-background/95 p-3 backdrop-blur md:hidden">
          <nav className="grid gap-1" aria-label="Principal (móvel)">
            {visible.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={cn("rounded-md px-3 py-2 text-sm", isActive(l.href) ? "bg-accent" : "text-muted-foreground")}
              >
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
        <Button variant="outline" size="sm" className="max-w-40" data-testid="user-menu">
          <User />
          <span className="truncate">{nickname}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
