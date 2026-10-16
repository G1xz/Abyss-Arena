"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/misc";

export function SubmitButton({ children, pendingText, className, variant, size, ...props }: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} className={className} variant={variant} size={size} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

export function Field({
  label,
  name,
  errors,
  hint,
  className,
  ...inputProps
}: { label: string; name: string; errors?: string[]; hint?: string } & React.ComponentProps<typeof Input>) {
  const id = inputProps.id ?? `field-${name}`;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} aria-invalid={errors?.length ? true : undefined} aria-describedby={errors?.length ? `${id}-err` : undefined} {...inputProps} />
      {hint && !errors?.length && <p className="text-xs text-muted-foreground">{hint}</p>}
      {errors?.length ? (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  );
}
