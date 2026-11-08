"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, Clock3, CreditCard, MapPin, Package, UserRound } from "lucide-react";
import { channelLabel, statusLabel } from "@/lib/order-validation";
import { isOrderDelayed } from "@/lib/operational-totals";
import { currency, formatElapsedMinutes, shortDateTime } from "@/lib/utils";
import type { Order } from "@/types";

const statusClass: Record<string, string> = {
  received: "bg-amber-50 text-amber-800",
  confirmed: "bg-blue-50 text-blue-800",
  preparing: "bg-violet-50 text-violet-800",
  ready: "bg-emerald-50 text-emerald-800",
  out_for_delivery: "bg-cyan-50 text-cyan-800",
  completed: "bg-stone-100 text-stone-700",
  cancelled: "bg-red-50 text-red-700",
};

function channelClass(channel: Order["channel"]) { return channel === "ifood" ? "bg-red-600 text-white" : channel === "99food" ? "bg-yellow-300 text-yellow-950" : "bg-basso-paper text-black/70"; }

function elapsedMinutes(iso: string) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)); }

export function OrderCard({ order, compact = false, onOpen }: { order: Order; compact?: boolean; onOpen?: (order: Order) => void }) {
  const minutes = elapsedMinutes(order.createdAt);
  const late = isOrderDelayed(order);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const content = <article className={`surface group overflow-hidden transition hover:-translate-y-0.5 hover:border-basso-gold/50 hover:shadow-lg ${late ? "border-amber-300" : ""}`}>
    <div className="flex items-start justify-between gap-3 border-b border-black/5 p-4">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-black text-black/40">#{order.number}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${channelClass(order.channel)}`}>{channelLabel[order.channel]}</span>{order.externalId && ["ifood","99food"].includes(order.channel) && <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[10px] font-black">Cód. {order.externalId}</span>}{order.priority && order.priority !== "normal" && <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${order.priority === "urgent" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{order.priority === "urgent" ? "Urgente" : "Alta"}</span>}</div><h3 className="mt-1 truncate font-display text-lg font-bold">{order.customerName}</h3></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusClass[order.status]}`}>{statusLabel[order.status]}</span>
    </div>
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-2 text-xs text-black/50"><span className="flex items-center gap-1"><Clock3 size={14}/>{minutes < 60 ? `${minutes} min` : shortDateTime(order.createdAt)}</span><span className="flex items-center gap-1"><Package size={14}/>{itemCount} item(ns)</span><span className="flex items-center gap-1"><UserRound size={14}/>{order.customerPhone || "Sem telefone"}</span>{order.address ? <span className="flex items-center gap-1"><MapPin size={14}/>{order.address.district}</span> : <span className="flex items-center gap-1"><CreditCard size={14}/>{order.paymentStatus === "paid" ? "Pago" : order.paymentStatus === "partial" ? "Parcial" : "Pendente"}</span>}</div>
      {!compact && <div className="rounded-xl bg-basso-paper p-3">{order.items.slice(0, 3).map((item) => <p key={item.id} className="line-clamp-1 text-sm"><strong>{item.quantity}×</strong> {item.name}</p>)}{order.items.length > 3 && <p className="mt-1 text-xs font-bold text-black/40">+ {order.items.length - 3} item(ns)</p>}</div>}
      {late && <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-2 text-xs font-bold text-amber-800"><AlertTriangle size={15}/>Pedido há {formatElapsedMinutes(minutes)}; confira a operação.</p>}
      <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase text-black/35">Total</p><strong className="text-lg text-basso-wine">{currency(order.total)}</strong></div><span className="flex items-center gap-1 text-xs font-bold text-basso-wine">Administrar <ChevronRight size={16}/></span></div>
    </div>
  </article>;
  if (onOpen) return <button type="button" className="block w-full text-left" onClick={() => onOpen(order)}>{content}</button>;
  return <Link href={`/painel/pedidos?order=${encodeURIComponent(order.id)}`} className="block">{content}</Link>;
}
