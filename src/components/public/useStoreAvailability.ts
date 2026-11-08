"use client";

import { useEffect, useState } from "react";
import { isDemoMode } from "@/lib/utils";

export type StoreAvailability = {
  loaded: boolean;
  open: boolean;
  /** Mensagem para o cliente quando a loja não está recebendo pedidos. */
  message: string;
  preparationMinutes?: number;
  deliveryMinutes?: number;
};

type StoreStatusBody = {
  operationalStatus?: string;
  acceptingOrders?: boolean;
  pauseReason?: string;
  publicMessage?: string;
  scheduleLabel?: string;
  preparationMinutes?: number;
  deliveryMinutes?: number;
};

const OPEN: StoreAvailability = { loaded: true, open: true, message: "" };

/** Consulta se a loja está recebendo pedidos (atualiza a cada minuto). */
export function useStoreAvailability(): StoreAvailability {
  const [state, setState] = useState<StoreAvailability>({ loaded: false, open: true, message: "" });

  useEffect(() => {
    if (isDemoMode()) { setState(OPEN); return; }
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/store-status", { cache: "no-store" });
        if (!response.ok) throw new Error("status");
        const body = await response.json() as StoreStatusBody;
        const open = Boolean(body.acceptingOrders && body.operationalStatus === "open");
        const message = open ? "" : body.operationalStatus === "paused"
          ? (body.pauseReason || body.publicMessage || "Pedidos pausados por alguns instantes.")
          : `Estamos fechados agora${body.scheduleLabel && /abre/i.test(body.scheduleLabel) ? ` — ${body.scheduleLabel.toLowerCase()}` : ""}.`;
        if (active) setState({ loaded: true, open, message, preparationMinutes: body.preparationMinutes, deliveryMinutes: body.deliveryMinutes });
      } catch {
        // Sem resposta, não bloqueia: o servidor ainda valida no envio do pedido.
        if (active) setState(OPEN);
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return state;
}
