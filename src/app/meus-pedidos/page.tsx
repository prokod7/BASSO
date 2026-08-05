"use client";
import Link from "next/link";
import { ClipboardList, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/context/CartContext";
import { useDemoState } from "@/lib/demo-store";
import { customerDeviceActions, useCustomerDeviceState, type DeviceOrderRef } from "@/lib/customer-device-store";
import { statusLabel } from "@/lib/order-validation";
import { currency, isDemoMode, normalizePhone, shortDateTime, uid } from "@/lib/utils";

export default function MyOrdersPage(){
  const stored=useCustomerDeviceState(state=>state.orders);
  const demoOrders=useDemoState(state=>state.orders);
  const cart=useCart();
  const [phone,setPhone]=useState("");
  const [refreshing,setRefreshing]=useState(false);
  const normalized=normalizePhone(phone);
  const demoRefs:DeviceOrderRef[]=useMemo(()=>isDemoMode()?demoOrders.map(order=>({id:order.id,number:order.number,phone:order.customerPhone,total:order.total,status:order.status,createdAt:order.createdAt,items:order.items})):[],[demoOrders]);
  const orders=useMemo(()=>{const map=new Map<string,DeviceOrderRef>();for(const item of [...stored,...demoRefs])if(!map.has(item.id))map.set(item.id,item);return [...map.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))},[stored,demoRefs]);
  const found=normalized.length>=10?orders.filter(order=>order.phone===normalized):orders;

  async function refresh(){
    setRefreshing(true);
    try{
      await Promise.all(stored.filter(order=>order.token).map(async order=>{
        const response=await fetch(`/api/public-orders/${encodeURIComponent(order.id)}?token=${encodeURIComponent(order.token!)}`,{cache:"no-store"});
        if(!response.ok)return;
        const body=await response.json();
        customerDeviceActions.updateOrder(order.id,{status:body.status,total:body.total,number:Number(body.number),items:body.items||order.items});
      }));
    }finally{setRefreshing(false)}
  }
  useEffect(()=>{if(!isDemoMode()&&stored.some(order=>order.token))void refresh()},[]); // one refresh on entry
  function repeat(order:DeviceOrderRef){for(const item of order.items)cart.addItem({...item,id:uid("cart")});cart.setOpen(true)}
  return <main className="min-h-screen bg-basso-paper p-4"><div className="mx-auto max-w-3xl py-10"><Link href="/" className="text-sm font-bold text-basso-wine">← Voltar ao cardápio</Link><div className="surface mt-5 p-6"><div className="flex items-start justify-between gap-4"><div><ClipboardList className="text-basso-wine"/><h1 className="mt-4 font-display text-3xl font-bold">Meus pedidos</h1><p className="mt-2 text-sm text-black/50">Pedidos feitos neste dispositivo ficam disponíveis com links privados. Digite o telefone para filtrar.</p></div><button type="button" className="btn-secondary" onClick={refresh} disabled={refreshing}><RefreshCw size={17} className={refreshing?"animate-spin":""}/>Atualizar</button></div><label className="relative mt-5 block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={17}/><input className="input pl-9" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Filtrar por telefone" inputMode="tel"/></label></div><div className="mt-5 space-y-3">{found.map(order=><article key={order.id} className="surface p-5"><div className="flex flex-wrap items-start justify-between gap-4"><Link href={`/pedido/${order.id}${order.token?`?token=${encodeURIComponent(order.token)}`:""}`} className="min-w-0 flex-1"><strong>Pedido #{order.number}</strong><p className="mt-1 text-xs text-black/45">{shortDateTime(order.createdAt)} • {statusLabel[order.status]}</p><p className="mt-2 text-sm font-bold text-basso-wine">{currency(order.total)}</p></Link><div className="flex gap-2"><button type="button" className="btn-secondary" onClick={()=>repeat(order)}><RotateCcw size={16}/>Repetir</button><button type="button" className="btn-ghost text-red-600" onClick={()=>customerDeviceActions.removeOrder(order.id)} aria-label="Remover pedido deste dispositivo"><Trash2 size={17}/></button></div></div></article>)}{!found.length&&<p className="surface p-6 text-center text-sm text-black/50">Nenhum pedido salvo neste dispositivo{normalized.length>=10?" para este telefone":""}.</p>}</div></div></main>
}
