import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/misc";

export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 py-8 sm:py-10", className)} {...props} />;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  icon: Icon,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <span className="mt-1 hidden size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary sm:grid">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="mb-1.5 text-[11px] font-semibold tracking-[0.22em] text-primary uppercase">{eyebrow}</p>}
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  WAITING: "Aguardando",
  READY: "Pronta",
  BANNING: "Bans",
  PICKING: "Picks",
  LOCKED: "Times definidos",
  AWAITING_RESULTS: "Aguardando resultados",
  DISPUTED: "Em disputa",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export function MatchStatusBadge({ status }: { status: string }) {
  const variant =
    status === "COMPLETED"
      ? "success"
      : status === "CANCELLED"
        ? "secondary"
        : status === "DISPUTED"
          ? "destructive"
          : status === "BANNING" || status === "PICKING"
            ? "default"
            : "warning";
  return <Badge variant={variant}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function EmptyState({ title, description, action, icon: Icon }: { title: string; description?: string; action?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 px-6 py-10 text-center">
      {Icon && (
        <span className="mb-1 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      )}
      <p className="font-display font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, className, icon: Icon }: { label: string; value: React.ReactNode; hint?: string; className?: string; icon?: LucideIcon }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-card/70 p-5", className)}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1.5 font-display text-2xl font-bold tabular">{value}</p>
        {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      {Icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-[18px]" />
        </span>
      )}
    </div>
  );
}
