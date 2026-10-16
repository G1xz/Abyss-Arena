/**
 * Ponte entre os serviços de domínio e a camada realtime. Os serviços avisam que uma partida
 * mudou; o servidor Socket.IO (quando presente no processo) envia o novo estado aos participantes.
 * Em testes ou scripts sem Socket.IO, a notificação é ignorada — o banco continua sendo a fonte da verdade.
 */
type Notifier = (matchId: string) => void | Promise<void>;

const g = globalThis as unknown as { __abyssMatchNotifier?: Notifier };

export function registerMatchNotifier(fn: Notifier | undefined) {
  g.__abyssMatchNotifier = fn;
}

export function notifyMatchChanged(matchId: string) {
  const fn = g.__abyssMatchNotifier;
  if (!fn) return;
  Promise.resolve(fn(matchId)).catch((err) => console.error("[realtime] falha ao publicar estado", err));
}
