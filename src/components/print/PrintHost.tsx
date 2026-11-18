"use client";

import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useStoreAvailability } from "@/components/public/useStoreAvailability";
import type { OrderDetail } from "@/types";
import { OrderTicket, TestTicket, type PrintType, type Verification } from "./OrderTicket";

export type PrintRequest = { orderId?: string; types: PrintType[]; copies?: number; test?: boolean; source?: "order_detail" | "kds" | "print_page" };
type Doc = { key: string; order?: OrderDetail; type?: PrintType; verification?: Verification | null; test?: boolean };

const EVENT = "lfb:print";

/**
 * Imprime na janela atual (modelo do Restaurante do Adão): desenha a comanda num portal
 * .print-receipt e chama window.print(). Sem iframe e sem janela extra; no atalho com
 * --kiosk-printing sai direto na impressora padrão.
 */
export function requestPrint(request: PrintRequest) {
  return new Promise<void>((resolve, reject) => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { request, resolve, reject } }));
  });
}

async function loadOrder(orderId: string) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.order) throw new Error(body.error || "Não foi possível carregar o pedido para imprimir.");
  return body.order as OrderDetail;
}

async function loadVerification(order: OrderDetail) {
  if (order.channel !== "own_delivery") return null;
  try {
    const response = await fetch(`/api/delivery/verification/${encodeURIComponent(order.id)}`, { cache: "no-store" });
    return response.ok ? ((await response.json()) as Verification) : null;
  } catch { return null; }
}

/** Abre a impressão. afterprint também dispara ao cancelar; sem afterprint (kiosk), segue em 1,5 s. */
function printNow() {
  return new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = () => { if (done) return; done = true; window.removeEventListener("afterprint", finish); resolve(); };
    window.addEventListener("afterprint", finish);
    try { window.print(); } catch (error) { window.removeEventListener("afterprint", finish); reject(error); return; }
    if (!done) window.setTimeout(finish, 1500);
  });
}

let queue: Promise<void> = Promise.resolve();

export function PrintHost() {
  const store = useStoreAvailability();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onPrint = (event: Event) => {
      const { request, resolve, reject } = (event as CustomEvent<{ request: PrintRequest; resolve: () => void; reject: (e: unknown) => void }>).detail;
      // Uma impressão por vez: pedidos seguidos entram em fila nesta janela.
      queue = queue.then(async () => {
        try {
          let list: Doc[];
          if (request.test) list = [{ key: "test", test: true }];
          else {
            const order = await loadOrder(request.orderId!);
            const verification = await loadVerification(order);
            list = request.types.map((type) => ({ key: `${order.id}:${type}`, order, type, verification }));
            for (const type of request.types) {
              void fetch(`/api/orders/${encodeURIComponent(order.id)}/print-browser`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, source: request.source || "order_detail" }), keepalive: true }).catch(() => undefined);
            }
          }
          for (let copy = 0; copy < Math.max(1, request.copies || 1); copy++) {
            flushSync(() => setDocs(list.map((doc) => ({ ...doc, key: `${doc.key}:${copy}` }))));
            // O QR do motoboy é SVG: já está no DOM depois do flushSync.
            await printNow();
          }
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          flushSync(() => setDocs(null));
        }
      });
    };
    window.addEventListener(EVENT, onPrint);
    return () => window.removeEventListener(EVENT, onPrint);
  }, []);

  if (!mounted || !docs) return null;
  return createPortal(
    <section className="print-receipt" aria-hidden="true">
      {docs.map((doc) => <div key={doc.key} className="print-via">
        {doc.test ? <TestTicket store={store} /> : <OrderTicket order={doc.order!} printType={doc.type!} verification={doc.verification} store={store} />}
      </div>)}
    </section>,
    document.body,
  );
}
