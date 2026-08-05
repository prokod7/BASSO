"use client";
import { ArrowRight, Clock3, MapPin, UserRound } from "lucide-react";
import { demoActions } from "@/lib/demo-store";
import { allowedStatuses, channelLabel, nextStatus, statusLabel } from "@/lib/order-validation";
import { currency, shortDateTime } from "@/lib/utils";
import type { Order } from "@/types";
const statusClass: Record<string,string> = { received:"bg-amber-50 text-amber-800", confirmed:"bg-blue-50 text-blue-800", preparing:"bg-violet-50 text-violet-800", ready:"bg-emerald-50 text-emerald-800", out_for_delivery:"bg-cyan-50 text-cyan-800", completed:"bg-stone-100 text-stone-700", cancelled:"bg-red-50 text-red-700" };
export function OrderCard({ order, compact = false }: { order: Order; compact?: boolean }) {
  const next = nextStatus(order.status, order.channel);
  return <article className="surface overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-black/5 p-4"><div><p className="text-xs font-bold text-black/40">#{order.number} • {channelLabel[order.channel]}</p><h3 className="mt-1 font-display text-lg font-bold">{order.customerName}</h3></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass[order.status]}`}>{statusLabel[order.status]}</span></div><div className="space-y-3 p-4"><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-black/50"><span className="flex items-center gap-1"><Clock3 size={14}/>{shortDateTime(order.createdAt)}</span><span className="flex items-center gap-1"><UserRound size={14}/>{order.customerPhone}</span>{order.address && <span className="flex items-center gap-1"><MapPin size={14}/>{order.address.district}</span>}</div>{!compact && <div className="rounded-xl bg-basso-paper p-3">{order.items.map(item => <p key={item.id} className="text-sm"><strong>{item.quantity}×</strong> {item.name}</p>)}</div>}<div className="flex items-center justify-between"><strong className="text-basso-wine">{currency(order.total)}</strong>{next && <button className="btn-primary min-h-9 px-3 py-1.5 text-xs" onClick={() => demoActions.updateOrderStatus(order.id, next)}>{statusLabel[next]} <ArrowRight size={14}/></button>}</div></div></article>;
}
