"use client";
import { useMemo, useState } from "react";
import { ClipboardList, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { OrderCard } from "@/components/internal/OrderCard";
import { useDemoState, demoActions } from "@/lib/demo-store";
import { channelLabel, statusLabel } from "@/lib/order-validation";
import type { OrderChannel, OrderStatus } from "@/types";
export default function OrdersPage(){
 const orders=useDemoState(s=>s.orders); const [query,setQuery]=useState(""); const [status,setStatus]=useState<"all"|OrderStatus>("all"); const [channel,setChannel]=useState<"all"|OrderChannel>("all");
 const filtered=useMemo(()=>orders.filter(o=>(status==="all"||o.status===status)&&(channel==="all"||o.channel===channel)&&(!query||`${o.number} ${o.customerName} ${o.customerPhone}`.toLowerCase().includes(query.toLowerCase()))),[orders,status,channel,query]);
 return <><PageHeader title="Pedidos centralizados" icon={ClipboardList} description="Pedidos do cardápio próprio, balcão, salão, QR Code, iFood e 99Food em uma única fila, sem misturar clientes de marketplace ao CRM." actions={<button className="btn-secondary" onClick={()=>demoActions.reset()}><RefreshCw size={17}/>Restaurar demonstração</button>}/><div className="surface mb-6 grid gap-3 p-4 md:grid-cols-[1fr_220px_220px]"><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35" size={17}/><input className="input pl-9" placeholder="Buscar número, cliente ou telefone" value={query} onChange={e=>setQuery(e.target.value)}/></label><select className="input" value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="all">Todos os status</option>{Object.entries(statusLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><select className="input" value={channel} onChange={e=>setChannel(e.target.value as typeof channel)}><option value="all">Todos os canais</option>{Object.entries(channelLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{filtered.map(o=><OrderCard key={o.id} order={o}/>)}</div>{!filtered.length&&<div className="surface p-10 text-center"><p className="font-display text-2xl font-bold">Nenhum pedido encontrado</p><p className="mt-2 text-sm text-black/50">Altere os filtros para visualizar outros pedidos.</p></div>}</>;
}
