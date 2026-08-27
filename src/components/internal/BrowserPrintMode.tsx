"use client";

import { useEffect } from "react";

function extractManualOrderPrint(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "POST") return null;

  const parsed = new URL(url, window.location.origin);
  const match = parsed.pathname.match(/^\/api\/orders\/([^/]+)\/print$/);
  if (!match) return null;

  // Só transforma a ação manual da Central da Comanda. Impressões automáticas,
  // testes e rotinas server-side continuam independentes deste modo.
  let reason = "";
  if (typeof init?.body === "string") {
    try {
      const payload = JSON.parse(init.body) as { reason?: unknown };
      reason = typeof payload.reason === "string" ? payload.reason : "";
    } catch {
      return null;
    }
  }
  if (!/central da comanda/i.test(reason)) return null;
  return decodeURIComponent(match[1]);
}

export function BrowserPrintMode() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const browserPrintFetch: typeof window.fetch = async (input, init) => {
      const orderId = extractManualOrderPrint(input, init);
      if (!orderId) return originalFetch(input, init);

      const printUrl = `/imprimir/${encodeURIComponent(orderId)}`;
      const popup = window.open(printUrl, "_blank", "width=520,height=820");
      if (!popup) {
        return new Response(JSON.stringify({ error: "O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente novamente." }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, browserPrint: true, printUrl }), {
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
