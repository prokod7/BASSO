"use client";
import { QRCodeSVG } from "qrcode.react";
import type { OrderDetail } from "@/types";
import { VendraAssinatura } from "@/components/shared/Vendra";
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
  return <div className={`ticket-80 ${printType === "cozinha" ? "ticket-kitchen" : ""}`}>
    {printType === "entrega" ? (
        <>
          <header>
            <p className="font-black">{store.businessName || "La Forneria Basso"}</p>
            <p>CNPJ: {store.cnpj || "62.332.415/0001-10"}</p>
            <p>{store.addressLabel || "Rua do Progresso, 407 — Centro — Rio Grande da Serra/SP"}</p>
          </header>
          <Divider />
          <div className="flex items-end justify-between gap-2">
            <strong className="text-[18px] tracking-normal">{title}</strong>
            <span>{stamp.date} - {stamp.time}</span>
          </div>
          <div className="mt-2">
            <p>Pedido: <strong className="text-[18px]">#{order.number}</strong></p>
            <p>Cliente: {order.customerName || "Consumidor"}</p>
            {order.customerPhone ? <p>Telefone: {order.customerPhone}</p> : null}
            {order.tableNumber ? <p>Mesa: {order.tableNumber}</p> : null}
            <p>ID do pedido: {order.id}</p>
          </div>

          {address ? <><Divider /><p>{address.street}, {address.number}</p><p>{address.district}</p><p>{address.city} - {address.state}</p>{address.complement ? <p>Comp.: {address.complement}</p> : null}{address.reference ? <p>Ref.: {address.reference}</p> : null}</> : null}

          <Divider />
          <div className="grid grid-cols-[1fr_auto] gap-2 font-bold"><span>Qt. Descrição</span><span>Valor</span></div>
          <Divider compact />
          <div className="space-y-3">
            {activeItems.map(item => <div key={item.id}>
              <div className="grid grid-cols-[1fr_auto] gap-2 text-[16px]"><strong>{item.quantity} {plain(compactItemName(item))}</strong><span>{currency(item.unitPrice * item.quantity).replace("R$ ", "")}</span></div>
              {itemDetails(item).map((line, index) => <p key={`${item.id}-${index}`} className={`pl-3 ${line.emphasis ? "font-bold" : ""}`}>{plain(line.text)}</p>)}
            </div>)}
          </div>

          <Divider />
          <div className="flex justify-between"><span>Quantidade de itens:</span><strong>{itemCount}</strong></div>
          <Divider compact />
          <div className="space-y-0.5">
            <div className="flex justify-between"><span>Total itens(+)</span><span>{currency(order.subtotal)}</span></div>
            <div className="flex justify-between"><span>Taxa de entrega(+)</span><span>{currency(order.deliveryFee)}</span></div>
            <div className="flex justify-between"><span>Desconto(-)</span><span>{currency(order.discount)}</span></div>
            <div className="flex justify-between text-[16px] font-black"><span>TOTAL(=)</span><span>{currency(order.total)}</span></div>
          </div>
          <Divider />
          <p>Forma de pagamento</p>
          <div className="flex justify-between"><strong>{paymentLabels[order.paymentMethod] || order.paymentMethod}</strong><strong>{currency(order.total)}</strong></div>
          {order.paymentMethod === "cash" && order.changeFor ? <><div className="flex justify-between"><span>- Receber:</span><span>{currency(order.changeFor)}</span></div><div className="flex justify-between"><span>- Troco:</span><span>{currency(Math.max(0, order.changeFor - order.total))}</span></div></> : null}
          {orderNote ? <><Divider /><p className="font-black">OBSERVAÇÕES</p><p className="font-bold">{orderNote}</p></> : null}

          {SHOW_PICKUP_CODE && order.channel === "own_delivery" && verification?.pickupCode ? <><Divider /><div className="text-center"><p className="font-black">RETIRADA DO MOTOBOY</p><p className="mt-1 text-[20px] font-black tracking-[.08em]">{verification.pickupCode}</p><p className="mt-1 text-[10.5px]">Escaneie o QR ou digite o código no PWA do motoboy.</p>{verification.pickupUrl ? <div className="mx-auto mt-2 w-fit"><QRCodeSVG value={verification.pickupUrl} size={118} level="M" marginSize={1} /></div> : null}<p className="mt-1 text-[10.5px]">ID: {order.id}</p></div></> : null}
          <div className="mt-3 flex justify-center"><VendraAssinatura variante="preta" altura={14} link={false} /></div>
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

