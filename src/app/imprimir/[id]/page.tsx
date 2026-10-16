"use client";

import { use, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { OrderDetail, CartItem } from "@/types";
import { currency, shortDateTime } from "@/lib/utils";
import { findAddon, findFlavor, findProduct } from "@/lib/catalog";

type PrintType = "entrega" | "cozinha";
type Verification = {
  applicable: boolean;
  pickupCode?: string;
  pickupUrl?: string;
  pickupVerifiedAt?: string | null;
};

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

function labelMass(value: unknown) {
  if (value === "traditional") return "Massa Tradicional de Longa Fermentação";
  if (value === "integral") return "Massa Integral";
  return typeof value === "string" && value ? value : "";
}

function labelFlavor(id: unknown) {
  if (typeof id !== "string" || !id) return "";
  return findFlavor(id)?.name || id.replaceAll("-", " ");
}

function itemDetails(item: CartItem) {
  const selection = (item.selection || {}) as Record<string, unknown>;
  const lines: Array<{ text: string; emphasis?: boolean }> = [];
  const mass = labelMass(selection.mass);
  if (mass) lines.push({ text: `-1x ${mass}` });

  const flavorA = labelFlavor(selection.flavorA || selection.grandeFlavor);
  const flavorB = labelFlavor(selection.flavorB || selection.grandeFlavorB);
  if (flavorA && flavorB) {
    lines.push({ text: `-1/2 ${flavorA}`, emphasis: true });
    lines.push({ text: `-1/2 ${flavorB}`, emphasis: true });
  } else if (flavorA) {
    lines.push({ text: `- ${flavorA}`, emphasis: true });
  }

  if(selection.secondGrandeFlavor) lines.push({text:`Grande 2: ${labelFlavor(selection.secondGrandeFlavor)}${selection.secondGrandeFlavorB?` / ${labelFlavor(selection.secondGrandeFlavorB)}`:""}`,emphasis:true});
  if(selection.sweetFlavor) lines.push({text:`${selection.sweetSize === "grande"?"Grande":"Broto"} doce: ${labelFlavor(selection.sweetFlavor)}`,emphasis:true});
  if(selection.beverage) lines.push({text:`Bebida: ${String(selection.beverage).replaceAll("-"," ")}`,emphasis:true});
  const removedA = Array.isArray(selection.removedA) ? selection.removedA.filter((x): x is string => typeof x === "string") : [];
  const removedB = Array.isArray(selection.removedB) ? selection.removedB.filter((x): x is string => typeof x === "string") : [];
  if (removedA.length) lines.push({ text: `  SEM ${removedA.join(", ")}`, emphasis: true });
  if (removedB.length) lines.push({ text: `  2ª METADE SEM ${removedB.join(", ")}`, emphasis: true });

  const addons = selection.addons && typeof selection.addons === "object" ? selection.addons as Record<string, number> : {};
  const placements = selection.addonPlacements && typeof selection.addonPlacements === "object" ? selection.addonPlacements as Record<string, string> : {};
  Object.entries(addons).filter(([, qty]) => Number(qty) > 0).forEach(([id, qty]) => {
    const addon = findAddon(id)?.name || id.replaceAll("-", " ");
    const placement = placements[id];
    const suffix = placement === "halfA" ? " • 1ª METADE" : placement === "halfB" ? " • 2ª METADE" : "";
    lines.push({ text: `+ ${qty}x ${addon}${suffix}`, emphasis: true });
  });

  if (selection.beverage && typeof selection.beverage === "string") {
    const beverage = findProduct(selection.beverage)?.name || selection.beverage.replaceAll("-", " ");
    lines.push({ text: `- Bebida: ${beverage}` });
  }
  if (selection.sweetBase === "hazelnut-zero") lines.push({ text: "- Base: Creme de Avelã Zero", emphasis: true });
  if (selection.cutPreference === "cut") lines.push({ text: "- CORTAR", emphasis: true });
  if (selection.cutPreference === "uncut") lines.push({ text: "- NÃO CORTAR", emphasis: true });

  const note = safeNote(typeof selection.notes === "string" ? selection.notes : "");
  if (note) lines.push({ text: `OBS: ${note}`, emphasis: true });
  return lines;
}

function dateAndTime(iso: string) {
  const date = new Date(iso);
  return {
    date: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    time: date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function BrowserPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verificationReady, setVerificationReady] = useState(false);
  const [printType, setPrintType] = useState<PrintType>("entrega");
  const [error, setError] = useState("");
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    const type = new URLSearchParams(window.location.search).get("tipo");
    if (type === "cozinha" || type === "entrega") setPrintType(type);
  }, []);

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
    if (!order) return;
    if (order.channel !== "own_delivery") {
      setVerificationReady(true);
      return;
    }
    let mounted = true;
    fetch(`/api/delivery/verification/${encodeURIComponent(order.id)}`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha ao preparar código de retirada.");
        return body as Verification;
      })
      .then(body => { if (mounted) setVerification(body); })
      .catch(() => { if (mounted) setVerification(null); })
      .finally(() => { if (mounted) setVerificationReady(true); });
    return () => { mounted = false; };
  }, [order]);

  useEffect(() => {
    if (!order || !verificationReady || printed) return;
    setPrinted(true);
    const timer = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(timer);
  }, [order, verificationReady, printed]);

  const activeItems = useMemo(
    () => order?.items.filter(item => item.productionStatus !== "cancelled") || [],
    [order],
  );

  if (error) return <main className="mx-auto max-w-xl p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800"><strong>Não foi possível preparar a impressão.</strong><p className="mt-2 text-sm">{error}</p></div></main>;
  if (!order) return <main className="grid min-h-screen place-items-center p-6 text-sm text-black/55">Preparando comanda...</main>;

  const address = order.address;
  const orderNote = safeNote(order.notes);
  const itemCount = activeItems.reduce((sum, item) => sum + item.quantity, 0);
  const stamp = dateAndTime(order.createdAt);
  const title = printType === "cozinha" ? "COZINHA" : (channelLabels[order.channel] || "PEDIDO");

  function switchType(next: PrintType) {
    setPrintType(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tipo", next);
    window.history.replaceState({}, "", url.toString());
  }

  return (
    <main className="print-shell mx-auto min-h-screen w-full max-w-[80mm] bg-white px-[3mm] py-[3mm] font-mono text-[11.5px] leading-[1.24] text-black">
      <style jsx global>{`
        @page { size: 80mm auto; margin: 2.5mm; }
        @media print {
          html, body { width: 80mm !important; background: white !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .print-shell { width: 75mm !important; max-width: 75mm !important; padding: 0 !important; margin: 0 auto !important; }
        }
      `}</style>

      <div className="no-print mb-4 grid grid-cols-2 gap-2 font-sans">
        <button className={`rounded-xl border px-3 py-2 text-sm font-bold ${printType === "entrega" ? "bg-black text-white" : "bg-white"}`} onClick={() => switchType("entrega")}>Entrega</button>
        <button className={`rounded-xl border px-3 py-2 text-sm font-bold ${printType === "cozinha" ? "bg-black text-white" : "bg-white"}`} onClick={() => switchType("cozinha")}>Cozinha</button>
        <button className="rounded-xl bg-black px-3 py-2 text-sm font-bold text-white" onClick={() => window.print()}>Imprimir novamente</button>
        <button className="rounded-xl border px-3 py-2 text-sm font-bold" onClick={() => window.close()}>Fechar</button>
      </div>

      {printType === "entrega" ? (
        <>
          <header>
            <p className="font-black">La Forneria Basso</p>
            <p>CNPJ: 62.332.415/0001-10</p>
            <p>Rua do Progresso, 407, Centro</p>
            <p>Rio Grande da Serra - SP</p>
          </header>
          <Divider />
          <div className="flex items-end justify-between gap-2">
            <strong className="text-[18px] tracking-[.12em]">{title}</strong>
            <span>{stamp.date} - {stamp.time}</span>
          </div>
          <div className="mt-2">
            <p>Pedido: <strong className="text-[16px]">#{order.number}</strong></p>
            <p>Cliente: {order.customerName || "Consumidor"}</p>
            {order.customerPhone ? <p>Telefone: {order.customerPhone}</p> : null}
            {order.tableNumber ? <p>Mesa: {order.tableNumber}</p> : null}
            <p>ID do pedido: {order.id}</p>
          </div>

          {address ? <><Divider /><p>{address.street}, {address.number}</p><p>{address.district}</p><p>{address.city} - {address.state}</p>{address.cep ? <p>CEP: {address.cep}</p> : null}{address.complement ? <p>Comp.: {address.complement}</p> : null}{address.reference ? <p>Ref.: {address.reference}</p> : null}</> : null}

          <Divider />
          <div className="grid grid-cols-[1fr_auto] gap-2 font-bold"><span>Qt. Descrição</span><span>Valor</span></div>
          <Divider compact />
          <div className="space-y-3">
            {activeItems.map(item => <div key={item.id}>
              <div className="grid grid-cols-[1fr_auto] gap-2 text-[15px]"><strong>{item.quantity} {item.name}</strong><span>{currency(item.unitPrice * item.quantity).replace("R$ ", "")}</span></div>
              {itemDetails(item).map((line, index) => <p key={`${item.id}-${index}`} className={`pl-3 ${line.emphasis ? "font-bold" : ""}`}>{line.text}</p>)}
            </div>)}
          </div>

          <Divider />
          <div className="flex justify-between"><span>Quantidade de itens:</span><strong>{itemCount}</strong></div>
          <Divider compact />
          <div className="space-y-0.5">
            <div className="flex justify-between"><span>Total itens(+)</span><span>{currency(order.subtotal)}</span></div>
            <div className="flex justify-between"><span>Taxa de entrega(+)</span><span>{currency(order.deliveryFee)}</span></div>
            <div className="flex justify-between"><span>Desconto(-)</span><span>{currency(order.discount)}</span></div>
            <div className="flex justify-between text-[15px] font-black"><span>TOTAL(=)</span><span>{currency(order.total)}</span></div>
          </div>
          <Divider />
          <p>Forma de pagamento</p>
          <div className="flex justify-between"><strong>{paymentLabels[order.paymentMethod] || order.paymentMethod}</strong><strong>{currency(order.total)}</strong></div>
          {order.paymentMethod === "cash" && order.changeFor ? <><div className="flex justify-between"><span>- Receber:</span><span>{currency(order.changeFor)}</span></div><div className="flex justify-between"><span>- Troco:</span><span>{currency(Math.max(0, order.changeFor - order.total))}</span></div></> : null}
          {orderNote ? <><Divider /><p className="font-black">OBSERVAÇÕES</p><p className="font-bold">{orderNote}</p></> : null}

          {order.channel === "own_delivery" && verification?.pickupCode ? <><Divider /><div className="text-center"><p className="font-black">RETIRADA DO MOTOBOY</p><p className="mt-1 text-[20px] font-black tracking-[.18em]">{verification.pickupCode}</p><p className="mt-1 text-[9px]">Escaneie o QR ou digite o código no PWA do motoboy.</p>{verification.pickupUrl ? <div className="mx-auto mt-2 w-fit"><QRCodeSVG value={verification.pickupUrl} size={118} level="M" marginSize={1} /></div> : null}<p className="mt-1 text-[9px]">ID: {order.id}</p></div></> : null}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2"><strong className="text-[18px] tracking-[.12em]">COZINHA</strong><span>{stamp.date} - {stamp.time}</span></div>
          <Divider />
          <p className="text-[16px] font-black">Pedido: #{order.number}</p>
          <p>{channelLabels[order.channel] || order.channel}{order.tableNumber ? ` • Mesa ${order.tableNumber}` : ""}</p>
          <p>{order.customerName || "Cliente"}{address?.district ? ` • ${address.district}` : ""}</p>
          <Divider />
          <div className="space-y-4">
            {activeItems.map(item => <div key={item.id}>
              <p className="text-[18px] font-black">{item.quantity} {item.name}</p>
              {itemDetails(item).map((line, index) => <p key={`${item.id}-k-${index}`} className={`pl-3 text-[13px] ${line.emphasis ? "font-black" : "font-bold"}`}>{line.text}</p>)}
            </div>)}
          </div>
          {orderNote ? <><Divider /><p className="text-[13px] font-black">OBS PEDIDO:</p><p className="text-[14px] font-black">{orderNote}</p></> : null}
          <Divider />
          <div className="flex justify-between"><span>Quantidade de itens:</span><strong>{itemCount}</strong></div>
          {order.channel === "own_delivery" && verification?.pickupCode ? <><Divider /><div className="text-center"><p className="font-black">CÓDIGO DE RETIRADA</p><p className="text-[20px] font-black tracking-[.18em]">{verification.pickupCode}</p>{verification.pickupUrl ? <div className="mx-auto mt-2 w-fit"><QRCodeSVG value={verification.pickupUrl} size={112} level="M" marginSize={1} /></div> : null}</div></> : null}
          <Divider />
          <p className="text-center text-[9px]">ID: {order.id}</p>
        </>
      )}
    </main>
  );
}

function Divider({ compact = false }: { compact?: boolean }) {
  return <div className={`${compact ? "my-1" : "my-2"} border-t border-dashed border-black`} />;
}

