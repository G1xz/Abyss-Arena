/**
 * Ponte entre os serviços de domínio e a camada realtime. Os serviços avisam que uma partida
 * mudou (ou que um usuário tem uma notificação); o servidor Socket.IO, quando presente no processo,
 * entrega aos destinatários. Em testes ou scripts sem Socket.IO, as notificações são ignoradas —
 * o banco continua sendo a fonte da verdade.
 */
type MatchNotifier = (matchId: string) => void | Promise<void>;
type UserNotifier = (userId: string, event: string, payload: unknown) => void | Promise<void>;

const g = globalThis as unknown as {
  __abyssMatchNotifier?: MatchNotifier;
  __abyssUserNotifier?: UserNotifier;
  __abyssOnline?: Map<string, number>;
};

export function registerMatchNotifier(fn: MatchNotifier | undefined) {
  g.__abyssMatchNotifier = fn;
}

export function registerUserNotifier(fn: UserNotifier | undefined) {
  g.__abyssUserNotifier = fn;
}

export function notifyMatchChanged(matchId: string) {
  const fn = g.__abyssMatchNotifier;
  if (!fn) return;
  Promise.resolve(fn(matchId)).catch((err) => console.error("[realtime] falha ao publicar estado", err));
}

export function notifyUser(userId: string, event: string, payload: unknown) {
  const fn = g.__abyssUserNotifier;
  if (!fn) return;
  Promise.resolve(fn(userId, event, payload)).catch((err) => console.error("[realtime] falha ao notificar usuário", err));
}

// ── Presença global (quem tem o site aberto). Informação não crítica, em memória. ──

const online = (g.__abyssOnline ??= new Map<string, number>());

export function markOnline(userId: string) {
  online.set(userId, (online.get(userId) ?? 0) + 1);
}

export function markOffline(userId: string) {
  const count = (online.get(userId) ?? 1) - 1;
  if (count <= 0) online.delete(userId);
  else online.set(userId, count);
}

export function getOnlineUserIds(): string[] {
  return [...online.keys()];
}
