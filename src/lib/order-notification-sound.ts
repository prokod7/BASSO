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
