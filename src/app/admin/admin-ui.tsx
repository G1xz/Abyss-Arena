"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/prices", label: "Preços e propostas" },
  { href: "/admin/characters", label: "Catálogo" },
  { href: "/admin/abyss", label: "Ciclos do Abismo" },
  { href: "/admin/disputes", label: "Disputas" },
  { href: "/admin/matches", label: "Partidas" },
  { href: "/admin/settings", label: "Configurações" },
  { href: "/admin/audit", label: "Auditoria" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b pb-2" aria-label="Administração">
      {items.map((i) => {
        const active = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn("rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground", active && "bg-accent text-foreground")}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

/** Botão que dispara uma server action administrativa com feedback. */
export function ActionButton({
  action,
  success,
  children,
  confirmText,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "action"> & {
  action: () => Promise<Result>;
  success?: string | ((data: unknown) => string);
  confirmText?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        start(async () => {
          const r = await action();
          if (r.ok) {
            if (success) toast.success(typeof success === "function" ? success(r.data) : success);
          } else toast.error(r.error);
        });
      }}
    >
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}
