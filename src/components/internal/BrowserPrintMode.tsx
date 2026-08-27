"use client";

import { useEffect } from "react";

type ManualPrint = { orderId: string; type: "entrega" | "cozinha"; source: "order_detail" | "kds" };

function extractManualOrderPrint(input: RequestInfo | URL, init?: RequestInit): ManualPrint | null {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "POST") return null;

  const parsed = new URL(url, window.location.origin);
  const match = parsed.pathname.match(/^\/api\/orders\/([^/]+)\/print$/);
  if (!match) return null;

  let reason = "";
  let sector = "all";
  if (typeof init?.body === "string") {
    try {
      const payload = JSON.parse(init.body) as { reason?: unknown; sector?: unknown };
      reason = typeof payload.reason === "string" ? payload.reason : "";
      sector = typeof payload.sector === "string" ? payload.sector : "all";
    } catch {
      return null;
    }
  }

  const fromOrderDetail = /central da comanda/i.test(reason);
  const fromKds = /impressão manual solicitada no kds/i.test(reason);
  if (!fromOrderDetail && !fromKds) return null;

  return {
    orderId: decodeURIComponent(match[1]),
    type: sector === "kitchen" || sector === "bar" ? "cozinha" : "entrega",
    source: fromKds ? "kds" : "order_detail",
  };
}

export function BrowserPrintMode() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const browserPrintFetch: typeof window.fetch = async (input, init) => {
      const manual = extractManualOrderPrint(input, init);
      if (!manual) return originalFetch(input, init);

      const printUrl = `/imprimir/${encodeURIComponent(manual.orderId)}?tipo=${manual.type}`;
      const popup = window.open(printUrl, "_blank", "width=520,height=860");
      if (!popup) {
        return new Response(JSON.stringify({ error: "O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente novamente." }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }

      // A impressão pelo navegador não cria job para o Print Bridge, mas mantém
      // trilha de auditoria separada para o gestor saber quem abriu cada via.
      void originalFetch(`/api/orders/${encodeURIComponent(manual.orderId)}/print-browser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: manual.type, source: manual.source }),
        keepalive: true,
      }).catch(() => undefined);

      return new Response(JSON.stringify({ ok: true, browserPrint: true, printUrl, type: manual.type }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    window.fetch = browserPrintFetch;
    return () => {
      if (window.fetch === browserPrintFetch) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
