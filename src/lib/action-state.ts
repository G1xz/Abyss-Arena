/** Estado padrão de formulários com Server Actions (useActionState). */
export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Valores enviados (exceto senhas), para repopular o formulário após erro. */
  values?: Record<string, string>;
}

export function echoValues(input: Record<string, unknown>, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) if (typeof input[k] === "string") out[k] = input[k] as string;
  return out;
}

export const initialFormState: FormState = {};

/** Aceita apenas caminhos internos para redirecionamentos pós-login. */
export function safeNextPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
