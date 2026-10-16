import { cn } from "@/lib/utils";
import { Badge } from "./ui/misc";

export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 py-8", className)} {...props} />;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold tracking-[0.2em] text-primary uppercase">{eyebrow}</p>}
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
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

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card/70 p-4", className)}>
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
