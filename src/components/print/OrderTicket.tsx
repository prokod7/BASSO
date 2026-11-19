"use client";
import { QRCodeSVG } from "qrcode.react";
import type { OrderDetail } from "@/types";
import { currency } from "@/lib/utils";
import { compactItemName, itemDetails } from "@/lib/item-presentation";

export type PrintType = "entrega" | "cozinha";
/** Código/QR de retirada do motoboy: desligado por enquanto (pedido do responsável). */
const SHOW_PICKUP_CODE = false;
/** A térmica distorce "½" (e outras frações): na comanda sai "1/2". */
const plain = (text: string) => text.replace(/½/g, "1/2").replace(/¼/g, "1/4").replace(/¾/g, "3/4").replace(/⅓/g, "1/3");
export type Verification = { applicable: boolean; pickupCode?: string; pickupUrl?: string; pickupVerifiedAt?: string | null };
export type TicketStore = { businessName?: string; cnpj?: string; addressLabel?: string };

const channelLabels: Record<string, string> = {
  own_delivery: "ENTREGA",
  pickup: "RETIRADA",
  counter: "BALCÃO",
  dine_in: "SALÃO",
  table_qr: "MESA",
  ifood: "IFOOD",
  "99food": "99FOOD",
};

const paymentLabels: Record<string, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  meal_voucher: "Vale-refeição",
  food_voucher: "Vale-alimentação",
};

function safeNote(value?: string | null) {
  const note = String(value || "").trim();
  if (!note) return "";
  if (/^[\[{]/.test(note)) {
    try { JSON.parse(note); return ""; } catch { /* observação normal */ }
  }
  if (/\b(metadata|requestId|errorId|digest|stack|deviceId|correlationId)\b\s*[:=]/i.test(note)) return "";
  return note.slice(0, 500);
}

function dateAndTime(iso: string) {
  const date = new Date(iso);
  return {
    date: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }),
    time: date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }),
  };
}


/**
 * Comanda térmica 80 mm (via de entrega/balcão ou da cozinha). Usada na tela /imprimir e na
 * impressão do painel (manual e estação automática), que desenha a comanda na própria página.
 */
export function OrderTicket({ order, printType, verification, store }: { order: OrderDetail; printType: PrintType; verification?: Verification | null; store: TicketStore }) {
  const activeItems = order.items.filter(item => item.productionStatus !== "cancelled");
  const address = order.address;
  const orderNote = safeNote(order.notes);
  const itemCount = activeItems.reduce((sum, item) => sum + item.quantity, 0);
  const stamp = dateAndTime(order.createdAt);
  const title = printType === "cozinha" ? "COZINHA" : (channelLabels[order.channel] || "PEDIDO");
  return <div className={`ticket-80 ${printType === "cozinha" ? "ticket-kitchen" : "ticket-counter"}`}>
    {printType === "entrega" ? (
        <>
          <style>{`
            .ticket-80.ticket-counter { margin: 0; padding: 0 1mm 0 6mm; font-size: 16px; line-height: 1.25; }
            .ticket-counter p, .ticket-counter .grid, .ticket-counter .flex { margin: 0; }
            .ticket-counter .counter-block { border-top: 1px dashed; margin-top: 1.5mm; padding-top: 1.5mm; }
            .ticket-counter .counter-item + .counter-item { margin-top: 0.8mm; }
            .ticket-counter .counter-item { break-inside: avoid; }
          `}</style>
          <header>
            <p>{store.businessName || "La Forneria Basso"}</p>
            <p className="text-[20px] font-black">{title} #{order.number}</p>
            <p>{stamp.date} {stamp.time}{order.tableNumber ? ` · Mesa ${order.tableNumber}` : ""}</p>
          </header>
          <p>{order.customerName || "Consumidor"}{order.customerPhone ? ` · ${order.customerPhone}` : ""}</p>
          {address && <div>
            <p>{[address.street, address.number, address.district].filter(Boolean).join(", ")}</p>
            <p>{[address.city, address.state].filter(Boolean).join(" - ")}</p>
            {address.complement && <p>Comp.: {address.complement}</p>}
            {address.reference && <p>Ref.: {address.reference}</p>}
          </div>}
          <div className="counter-block">
            {activeItems.map(item => {
              const selection = item.selection;
              const pizza = (item.kind === "pizza" || item.kind === "reward") && selection && "flavorA" in selection ? selection : null;
              const details = itemDetails(item);
              const name = pizza ? `${item.kind === "reward" ? "Recompensa · " : ""}PIZZA ${pizza.size === "broto" ? "BROTO" : "GRANDE"}` : compactItemName(item);
              return <div key={item.id} className="counter-item">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-1">
                  <strong>{item.quantity}x {plain(name)}</strong><span>{currency(item.unitPrice * item.quantity).replace(/^R\$\s*/, "")}</span>
                </div>
                {details.filter(line => !(pizza?.mass === "traditional" && line.text.startsWith("Massa:"))).map((line, i) => <p key={i} className={line.emphasis ? "font-black" : undefined}>{plain(line.text)}</p>)}
              </div>;
            })}
          </div>
          <div className="counter-block">
            {(order.discount > 0 || order.deliveryFee > 0) && <div className="flex justify-between"><span>Subtotal</span><span>{currency(order.subtotal)}</span></div>}
            {order.deliveryFee > 0 && <div className="flex justify-between"><span>Entrega</span><span>{currency(order.deliveryFee)}</span></div>}
            {order.discount > 0 && <div className="flex justify-between"><span>Desconto</span><span>−{currency(order.discount)}</span></div>}
            <div className="flex justify-between text-[18px]"><strong>Total</strong><strong>{currency(order.total)}</strong></div>
            <p>{paymentLabels[order.paymentMethod] || order.paymentMethod}</p>
            {order.paymentMethod === "cash" && !!order.changeFor && <p>Receber {currency(order.changeFor)} · Troco {currency(Math.max(0, order.changeFor - order.total))}</p>}
          </div>
          {orderNote && <p className="font-black">Obs.: {orderNote}</p>}
          {SHOW_PICKUP_CODE && order.channel === "own_delivery" && verification?.pickupCode ? <><Divider /><div className="text-center"><p className="font-black">RETIRADA DO MOTOBOY</p><p className="mt-1 text-[20px] font-black tracking-[.08em]">{verification.pickupCode}</p><p className="mt-1 text-[10.5px]">Escaneie o QR ou digite o código no PWA do motoboy.</p>{verification.pickupUrl ? <div className="mx-auto mt-2 w-fit"><QRCodeSVG value={verification.pickupUrl} size={118} level="M" marginSize={1} /></div> : null}<p className="mt-1 text-[10.5px]">ID: {order.id}</p></div></> : null}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2"><strong className="text-[22px] tracking-normal">COZINHA</strong><span>{stamp.date} - {stamp.time}</span></div>
          <Divider />
          <p className="text-[21px] font-black">Pedido: #{order.number}</p>
          <p>{channelLabels[order.channel] || order.channel}{order.tableNumber ? ` • Mesa ${order.tableNumber}` : ""}</p>
          <p>{order.customerName || "Cliente"}{address?.district ? ` • ${address.district}` : ""}</p>
          <Divider />
          <div className="space-y-4">
            {activeItems.map(item => <div key={item.id}>
              <p className="text-[22px] font-black">{item.quantity} {plain(compactItemName(item))}</p>
              {itemDetails(item).map((line, index) => <p key={`${item.id}-k-${index}`} className={`pl-3 text-[16px] ${line.emphasis ? "font-black" : "font-bold"}`}>{plain(line.text)}</p>)}
            </div>)}
          </div>
          {orderNote ? <><Divider /><p className="text-[16px] font-black">OBS PEDIDO:</p><p className="text-[17px] font-black">{orderNote}</p></> : null}
          <Divider />
          <div className="flex justify-between"><span>Quantidade de itens:</span><strong>{itemCount}</strong></div>
          {SHOW_PICKUP_CODE && order.channel === "own_delivery" && verification?.pickupCode ? <><Divider /><div className="text-center"><p className="font-black">CÓDIGO DE RETIRADA</p><p className="text-[22px] font-black tracking-[.08em]">{verification.pickupCode}</p>{verification.pickupUrl ? <div className="mx-auto mt-2 w-fit"><QRCodeSVG value={verification.pickupUrl} size={112} level="M" marginSize={1} /></div> : null}</div></> : null}
          <Divider />
          <p className="text-center text-[10.5px]">ID: {order.id}</p>
        </>
      )}
  </div>;
}

export function TestTicket({ store }: { store: TicketStore }) {
  return <div className="ticket-80 text-center">
    <p className="font-black">{store.businessName || "La Forneria Basso"}</p>
    <Divider />
    <p className="text-[22px] font-black">TESTE DE IMPRESSÃO</p>
    <p>{new Date().toLocaleString("pt-BR")}</p>
    <Divider />
    <p>Se você está lendo isto, a impressora está configurada.</p>
  </div>;
}

function Divider({ compact = false }: { compact?: boolean }) {
  return <div className={`${compact ? "my-1" : "my-2"} border-t border-dashed border-black`} />;
}

