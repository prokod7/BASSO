"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, GripVertical, Loader2, MessageCircle, Pencil, Printer } from "lucide-react";
import { OrderCard } from "@/components/internal/OrderCard";
import { demoActions } from "@/lib/demo-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { orderTransitionMatrix, requiresTransitionReason } from "@/lib/operational-state";
import { allowedStatuses, statusLabel } from "@/lib/order-validation";
import { isDemoMode } from "@/lib/utils";
import type { Order, OrderStatus } from "@/types";

const columns: Array<{ status: OrderStatus; label: string }> = [
  { status: "received", label: "Recebidos" }, { status: "confirmed", label: "Confirmados" },
  { status: "preparing", label: "Em preparo" }, { status: "ready", label: "Prontos" },
  { status: "out_for_delivery", label: "Em entrega" }, { status: "completed", label: "Concluídos" },
  { status: "cancelled", label: "Cancelados" },
];
/** Próxima etapa do fluxo normal (sem cancelar). */
const FLOW: OrderStatus[] = ["received", "confirmed", "preparing", "ready", "out_for_delivery", "completed"];
export function nextStatus(order: Order): OrderStatus | null {
  const allowed = destinations(order);
  return FLOW.slice(FLOW.indexOf(order.status) + 1).find(status => allowed.includes(status)) ?? null;
}
function whatsappLink(phone: string) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
}

function destinations(order: Order): OrderStatus[] {
  return orderTransitionMatrix[order.status].filter(status => status === "cancelled" || allowedStatuses(order.channel).includes(status));
}

export function OrderKanban({ orders, onOpen, onEdit }: { orders: Order[]; onOpen: (order: Order) => void; onEdit?: (order: Order) => void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [hovered, setHovered] = useState<OrderStatus | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const saving = useRef(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const draggedOrder = orders.find(order => order.id === dragging);

  async function move(order: Order, target: OrderStatus) {
    if (saving.current || order.status === target || !destinations(order).includes(target)) return;
    let reason: string | undefined;
    if (requiresTransitionReason(order.status, target)) {
      reason = window.prompt(`Informe o motivo para mover de ${statusLabel[order.status]} para ${statusLabel[target]}:`)?.trim() || undefined;
      if (!reason) { setDragging(null); setHovered(null); return; }
    }
    saving.current = true; setWorking(order.id); setFeedback(null); setDragging(null); setHovered(null);
    try {
      let status = target;
      if (isDemoMode()) demoActions.updateOrderStatus(order.id, target, "Operação Kanban");
      else {
        const result = await apiJson<{status: OrderStatus; version: number}>(`/api/orders/${order.id}/status`, {
          method: "PATCH", body: JSON.stringify({status: target, reason, expectedVersion: order.version ?? 1}),
        });
        status = result.status;
        demoActions.applyConfirmedOrderStatus(order.id, result.status, result.version);
      }
      setFeedback({error: false, message: `Pedido #${order.number}: ${statusLabel[status]}.${status === "completed" ? " O pagamento não foi alterado." : ""}`});
    } catch (error) {
      setFeedback({error: true, message: `${formatApiError(error, "Não foi possível mover o pedido.")} Atualizando a posição com os dados do servidor.`});
    } finally {
      if (!isDemoMode()) requestOperationalRefresh();
      saving.current = false; setWorking(null);
    }
  }

  async function print(order: Order) {
    if (saving.current) return;
    setWorking(order.id); setFeedback(null);
    try {
      if (!isDemoMode()) await apiJson(`/api/orders/${order.id}/print`, { method: "POST", body: JSON.stringify({ sector: "all", reason: "Impressão pelo card do pedido" }) });
      setFeedback({error: false, message: `Pedido #${order.number} enviado para a impressora.`});
    } catch (error) {
      setFeedback({error: true, message: formatApiError(error, "Não foi possível imprimir.")});
    } finally { setWorking(null); }
  }

  return <>
    {feedback && <p role={feedback.error ? "alert" : "status"} className={`sticky top-2 z-20 mb-3 rounded-xl border p-3 text-sm font-semibold shadow-sm ${feedback.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{feedback.message}</p>}
    <p className="mb-3 text-xs text-black/50">Deslize as colunas. Arraste pela alça ou use os botões do card. Concluir não registra pagamento.</p>
    <div className="flex snap-x snap-proximity gap-4 overflow-x-auto overscroll-x-contain pb-4" aria-label="Quadro de pedidos">
      {columns.map(column => {
        const rows = orders.filter(order => order.status === column.status);
        const accepts = Boolean(draggedOrder && destinations(draggedOrder).includes(column.status) && !working);
        return <section key={column.status} role="region" aria-label={column.label}
          onDragOver={event => { if (accepts) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setHovered(column.status); } }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(null); }}
          onDrop={event => { event.preventDefault(); if (accepts && draggedOrder) void move(draggedOrder, column.status); setHovered(null); setDragging(null); }}
          className={`w-[min(85vw,320px)] shrink-0 snap-start rounded-3xl border-2 p-3 transition ${accepts && hovered === column.status ? "border-basso-wine bg-basso-gold/20 ring-2 ring-basso-wine/20" : accepts ? "border-basso-gold/50 bg-basso-gold/5" : "border-transparent bg-black/[.025]"}`}>
          <div className="mb-3 flex items-center justify-between px-2"><h2 className="font-display text-xl font-bold">{column.label}</h2><span className="rounded-full bg-white px-2.5 py-1 text-xs font-black">{rows.length}</span></div>
          <div className="space-y-3">{rows.map(order => {
            const next = nextStatus(order);
            const wa = whatsappLink(order.customerPhone);
            const busy = !!working;
            return <div key={order.id} data-order-id={order.id} aria-busy={working === order.id} className={`rounded-2xl border border-black/5 bg-white p-2 ${dragging === order.id ? "opacity-50" : ""}`}>
              <div className="mb-1 flex items-center justify-between">
                <button type="button" draggable={!working} disabled={!!working} aria-label={`Arrastar pedido ${order.number}`} title="Arraste para outra coluna" onClick={() => onOpen(order)}
                  onDragStart={event => { if (saving.current) { event.preventDefault(); return; } event.dataTransfer.setData("text/plain", order.id); event.dataTransfer.effectAllowed = "move"; setDragging(order.id); }}
                  onDragEnd={() => {setDragging(null);setHovered(null);}}
                  className="grid h-10 w-10 cursor-grab place-items-center rounded-lg text-black/50 hover:bg-black/5 active:cursor-grabbing"><GripVertical size={20}/></button>
                {working === order.id && <span role="status" className="flex items-center gap-1 text-xs font-bold text-basso-wine"><Loader2 size={14} className="animate-spin"/>Salvando...</span>}
              </div>
              <OrderCard order={order} compact onOpen={onOpen}/>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <button type="button" aria-label={`Imprimir pedido ${order.number}`} disabled={busy} onClick={() => void print(order)} className="flex min-h-11 flex-col items-center justify-center rounded-xl border bg-white text-[11px] font-bold hover:bg-black/5 disabled:opacity-50"><Printer size={17}/>Imprimir</button>
                <button type="button" aria-label={`Editar pedido ${order.number}`} disabled={busy} onClick={() => (onEdit ?? onOpen)(order)} className="flex min-h-11 flex-col items-center justify-center rounded-xl border bg-white text-[11px] font-bold hover:bg-black/5 disabled:opacity-50"><Pencil size={17}/>Editar</button>
                {wa ? <a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp do cliente do pedido ${order.number}`} className="flex min-h-11 flex-col items-center justify-center rounded-xl border bg-white text-[11px] font-bold text-emerald-700 hover:bg-emerald-50"><MessageCircle size={17}/>WhatsApp</a>
                  : <span className="flex min-h-11 flex-col items-center justify-center rounded-xl border bg-black/[.03] text-[11px] font-bold text-black/30"><MessageCircle size={17}/>Sem fone</span>}
                {next && <button type="button" aria-label={`Avançar pedido ${order.number} para ${statusLabel[next]}`} disabled={busy} onClick={() => void move(order, next)} className={`col-span-3 flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50 ${next === "completed" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-basso-wine hover:opacity-90"}`}>{next === "completed" ? <Check size={17}/> : <ArrowRight size={17}/>}{next === "completed" ? "Concluir pedido" : `Avançar: ${statusLabel[next]}`}</button>}
              </div>
            </div>;
          })}{!rows.length && <div className="rounded-2xl border border-dashed border-black/10 p-8 text-center text-xs text-black/40">{accepts ? "Solte o pedido aqui" : "Sem pedidos nesta etapa"}</div>}</div>
        </section>;
      })}
    </div>
  </>;
}
