"use client";

import { use, useEffect, useMemo, useState } from "react";
import type { OrderDetail, CartItem } from "@/types";
import { currency, shortDateTime } from "@/lib/utils";

const channelLabels: Record<string, string> = {
  own_delivery: "Entrega",
  pickup: "Retirada",
  counter: "Balcão",
  dine_in: "Salão",
  table_qr: "Mesa",
  ifood: "iFood",
  "99food": "99Food",
};

const paymentLabels: Record<string, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  meal_voucher: "Vale-refeição",
  food_voucher: "Vale-alimentação",
};

function selectionLines(item: CartItem) {
  const selection = (item.selection || {}) as Record<string, unknown>;
  const lines: string[] = [];
  const size = typeof selection.size === "string" ? selection.size : "";
  const mass = typeof selection.mass === "string" ? selection.mass : "";
  if (size || mass) lines.push([size ? `Tamanho: ${size}` : "", mass ? `Massa: ${mass}` : ""].filter(Boolean).join(" • "));

  const flavorA = typeof selection.flavorA === "string" ? selection.flavorA : "";
  const flavorB = typeof selection.flavorB === "string" ? selection.flavorB : "";
  if (flavorA) lines.push(`Sabor: ${flavorA}${flavorB ? ` / ${flavorB}` : ""}`);

  const grandeFlavor = typeof selection.grandeFlavor === "string" ? selection.grandeFlavor : "";
  const grandeFlavorB = typeof selection.grandeFlavorB === "string" ? selection.grandeFlavorB : "";
  if (grandeFlavor) lines.push(`Pizza: ${grandeFlavor}${grandeFlavorB ? ` / ${grandeFlavorB}` : ""}`);

  const beverage = typeof selection.beverage === "string" ? selection.beverage : "";
  if (beverage) lines.push(`Bebida: ${beverage}`);

  const removedA = Array.isArray(selection.removedA) ? selection.removedA.filter(value => typeof value === "string") : [];
  const removedB = Array.isArray(selection.removedB) ? selection.removedB.filter(value => typeof value === "string") : [];
  if (removedA.length) lines.push(`Sem: ${removedA.join(", ")}`);
  if (removedB.length) lines.push(`Sem 2ª metade: ${removedB.join(", ")}`);

  const notes = typeof selection.notes === "string" ? selection.notes.trim() : "";
  if (notes) lines.push(`Obs.: ${notes}`);
  return lines;
}

export default function BrowserPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/orders/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar o pedido.");
        return body.order as OrderDetail;
      })
      .then(value => mounted && setOrder(value))
      .catch(cause => mounted && setError(cause instanceof Error ? cause.message : "Falha ao carregar o pedido."));
    return () => { mounted = false; };
  }, [id]);

  useEffect(() => {
    if (!order || printing) return;
    setPrinting(true);
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  }, [order, printing]);

  const activeItems = useMemo(
    () => order?.items.filter(item => item.productionStatus !== "cancelled") || [],
    [order],
  );

  if (error) {
    return <main className="mx-auto max-w-xl p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800"><strong>Não foi possível preparar a impressão.</strong><p className="mt-2 text-sm">{error}</p></div></main>;
  }

  if (!order) {
    return <main className="grid min-h-screen place-items-center p-6 text-sm text-black/55">Preparando comprovante...</main>;
  }

  const address = order.address;
  return (
    <main className="print-shell mx-auto min-h-screen w-full max-w-[80mm] bg-white px-3 py-4 font-mono text-[12px] leading-tight text-black">
      <style jsx global>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print {
          html, body { background: white !important; }
          body { margin: 0 !important; }
          .no-print { display: none !important; }
          .print-shell { width: 74mm !important; max-width: 74mm !important; padding: 0 !important; margin: 0 auto !important; }
        }
      `}</style>

      <div className="no-print mb-4 flex gap-2 font-sans">
        <button className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white" onClick={() => window.print()}>Imprimir novamente</button>
        <button className="rounded-xl border px-4 py-2 text-sm font-bold" onClick={() => window.close()}>Fechar</button>
      </div>

      <header className="text-center">
        <p className="text-[15px] font-black">LA FORNERIA BASSO</p>
        <p>Rua do Progresso, 407</p>
        <p>Rio Grande da Serra/SP</p>
      </header>

      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-[15px] font-black">PEDIDO #{order.number}</p>
      <p>Canal: {channelLabels[order.channel] || order.channel}</p>
      <p>Data: {shortDateTime(order.createdAt)}</p>
      {order.tableNumber ? <p>Mesa: {order.tableNumber}</p> : null}

      <div className="my-2 border-t border-dashed border-black" />
      <p className="font-black">CLIENTE</p>
      <p>{order.customerName || "Consumidor"}</p>
      {order.customerPhone ? <p>{order.customerPhone}</p> : null}

      {address ? <>
        <div className="my-2 border-t border-dashed border-black" />
        <p className="font-black">ENDEREÇO</p>
        <p>{address.street}, {address.number}</p>
        <p>{address.district} • {address.city}/{address.state}</p>
        {address.cep ? <p>CEP {address.cep}</p> : null}
        {address.complement ? <p>Comp.: {address.complement}</p> : null}
        {address.reference ? <p>Ref.: {address.reference}</p> : null}
      </> : null}

      <div className="my-2 border-t border-dashed border-black" />
      <p className="font-black">ITENS</p>
      <div className="mt-2 space-y-3">
        {activeItems.map(item => <div key={item.id}>
          <div className="flex justify-between gap-2 font-black"><span>{item.quantity}x {item.name}</span><span>{currency(item.unitPrice * item.quantity)}</span></div>
          {selectionLines(item).map(line => <p key={line} className="pl-2">{line}</p>)}
        </div>)}
      </div>

      <div className="my-2 border-t border-dashed border-black" />
      <div className="space-y-1">
        <div className="flex justify-between"><span>Subtotal</span><span>{currency(order.subtotal)}</span></div>
        {order.discount > 0 ? <div className="flex justify-between"><span>Desconto</span><span>-{currency(order.discount)}</span></div> : null}
        {order.deliveryFee > 0 ? <div className="flex justify-between"><span>Entrega</span><span>{currency(order.deliveryFee)}</span></div> : null}
        <div className="flex justify-between text-[15px] font-black"><span>TOTAL</span><span>{currency(order.total)}</span></div>
      </div>

      <div className="my-2 border-t border-dashed border-black" />
      <p>Pagamento: {paymentLabels[order.paymentMethod] || order.paymentMethod}</p>
      {order.changeFor ? <p>Troco para: {currency(order.changeFor)}</p> : null}
      {order.notes ? <><div className="my-2 border-t border-dashed border-black" /><p className="font-black">OBSERVAÇÕES</p><p>{order.notes}</p></> : null}

      <div className="my-3 border-t border-dashed border-black" />
      <p className="text-center">Obrigado!</p>
    </main>
  );
}
