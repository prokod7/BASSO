"use client";

import { BASSO_NEW_ORDER_AUDIO } from "@/lib/basso-notification-audio";

// Painel e KDS usam o mesmo reprodutor nesta aba. Nunca reiniciar uma
// campainha em andamento: o corte abrupto gera estalo e sons sobrepostos.
let player: HTMLAudioElement | null = null;
let starting: Promise<void> | null = null;

export function playNewOrderSound(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (starting) return starting;
  if (!player) {
    player = new Audio(BASSO_NEW_ORDER_AUDIO);
    player.preload = "auto";
  }
  if (!player.paused && !player.ended) return Promise.resolve();
  player.currentTime = 0;
  try {
    starting = Promise.resolve(player.play())
      .catch(() => undefined) // Autoplay bloqueado não pode interromper a operação.
      .finally(() => { starting = null; });
    return starting;
  } catch {
    return Promise.resolve();
  }
}

const LEDGER_KEY = "lfb-order-bell";
const MAX_IDS = 600;
// Reserva se o navegador bloquear o localStorage (aba anônima etc.).
let fallback: string[] | null = null;

function readLedger(): string[] | null {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ids?: string[] };
    return Array.isArray(parsed.ids) ? parsed.ids : [];
  } catch { return fallback; }
}

function writeLedger(ids: string[]) {
  const kept = ids.slice(-MAX_IDS);
  fallback = kept;
  try { localStorage.setItem(LEDGER_KEY, JSON.stringify({ ids: kept })); } catch { /* fica na reserva */ }
}

/**
 * Campainha UMA vez por pedido neste aparelho: o registro fica no localStorage (vale para
 * todas as abas, painel e KDS, e sobrevive a recarregar a página). Na primeira vez neste
 * aparelho só registra os pedidos que já existem. Retorna true quando há pedido novo para tocar.
 */
export function ringForNewOrders(orderIds: string[], relevant: (id: string) => boolean = () => true) {
  if (typeof window === "undefined" || !orderIds.length) return false;
  const known = readLedger();
  if (known === null) { writeLedger(orderIds); return false; }
  const seen = new Set(known);
  const fresh = orderIds.filter((id) => !seen.has(id));
  if (!fresh.length) return false;
  writeLedger([...known, ...fresh]);
  return fresh.some(relevant);
}
