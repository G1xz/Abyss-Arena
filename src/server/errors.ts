/**
 * Erros de domínio com mensagens seguras para exibição.
 * Qualquer outro erro é tratado como interno e nunca tem detalhes expostos ao cliente.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVALID_STATE"
  | "NOT_YOUR_TURN"
  | "STALE_ACTION"
  | "ILLEGAL_ACTION"
  | "DECK_INVALID"
  | "UNAVAILABLE"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; code: ErrorCode; error: string; fieldErrors?: Record<string, string[]> };

/** Converte qualquer erro em resposta segura. Erros desconhecidos são logados no servidor. */
export function toErrorResult(err: unknown): { ok: false; code: ErrorCode; error: string; fieldErrors?: Record<string, string[]> } {
  if (isAppError(err)) {
    const fieldErrors = err.details?.fieldErrors as Record<string, string[]> | undefined;
    return { ok: false, code: err.code, error: err.message, ...(fieldErrors ? { fieldErrors } : {}) };
  }
  console.error("[erro interno]", err);
  return { ok: false, code: "INTERNAL", error: "Erro interno. Tente novamente em instantes." };
}
