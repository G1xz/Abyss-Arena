import { AppError } from "./errors";

/**
 * Rate limiting em memória (janela deslizante). Suficiente para uma instância única.
 * Para múltiplas instâncias, trocar por um store compartilhado (ex.: Redis).
 */
type Bucket = number[];
const globalStore = globalThis as unknown as { __abyssRateLimit?: Map<string, Bucket> };
const store = (globalStore.__abyssRateLimit ??= new Map<string, Bucket>());

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 10 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { limit: 5, windowMs: 60 * 60_000 },
  createRoom: { limit: 10, windowMs: 10 * 60_000 },
  matchAction: { limit: 60, windowMs: 60_000 },
  submitResult: { limit: 20, windowMs: 10 * 60_000 },
  adminAction: { limit: 120, windowMs: 60_000 },
} as const;

export function checkRateLimit(key: string, opts: { limit: number; windowMs: number }, now = Date.now()): boolean {
  if (process.env.RATE_LIMIT_DISABLED === "true") return true;
  const bucket = (store.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (bucket.length >= opts.limit) {
    store.set(key, bucket);
    return false;
  }
  bucket.push(now);
  store.set(key, bucket);
  return true;
}

export function enforceRateLimit(scope: keyof typeof RATE_LIMITS, identity: string) {
  if (!checkRateLimit(`${scope}:${identity}`, RATE_LIMITS[scope])) {
    throw new AppError("RATE_LIMITED", "Muitas tentativas. Aguarde um pouco e tente novamente.");
  }
}

export function resetRateLimits() {
  store.clear();
}
