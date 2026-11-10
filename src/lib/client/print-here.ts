"use client";

export type PrintType = "entrega" | "cozinha";

/** Abre uma via num iframe invisível; a página /imprimir chama window.print() sozinha. Resolve quando a impressão termina. */
function printOne(orderId: string, type: PrintType) {
  return new Promise<void>((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:80mm;height:10px;border:0;opacity:0;pointer-events:none";
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.setTimeout(() => frame.remove(), 1000);
      resolve();
    };
    frame.onload = () => {
      try { frame.contentWindow?.addEventListener("afterprint", finish); } catch { /* mesma origem: não deve falhar */ }
    };
    // Segurança: nunca fica preso se o navegador não avisar o fim da impressão.
    window.setTimeout(finish, 90_000);
    frame.src = `/imprimir/${encodeURIComponent(orderId)}?tipo=${type}`;
    document.body.appendChild(frame);
  });
}

/**
 * Impressão manual: imprime NESTE aparelho na hora (janela de impressão do navegador, ou direto
 * na impressora padrão quando aberto pelo atalho de impressão automática). Não depende de fila.
 */
export async function printHere(orderId: string, types: PrintType[], source: "order_detail" | "kds" | "print_page" = "order_detail") {
  for (const type of types) {
    void fetch(`/api/orders/${encodeURIComponent(orderId)}/print-browser`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, source }), keepalive: true,
    }).catch(() => undefined);
    await printOne(orderId, type);
  }
}
