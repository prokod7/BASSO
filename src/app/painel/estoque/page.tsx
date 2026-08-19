"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, Loader2, Minus, Plus, RefreshCw, Search, X } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { useDemoState, demoActions } from "@/lib/demo-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { isDemoMode, shortDateTime, uid } from "@/lib/utils";
import type { InventoryItem } from "@/types";

type PendingAdjustment = { item: InventoryItem; delta: number } | null;

export default function InventoryPage() {
  const snapshot = useDemoState((state) => state.inventory);
  const [remote, setRemote] = useState<InventoryItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState("");
  const [pending, setPending] = useState<PendingAdjustment>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  const inventory = remote ?? snapshot;
  const items = useMemo(() => inventory.filter((item) => !query || item.name.toLowerCase().includes(query.toLowerCase())), [inventory, query]);
  const lowCount = inventory.filter((item) => item.quantity <= item.minQuantity).length;
  const outCount = inventory.filter((item) => item.quantity <= 0).length;

  async function load() {
    if (isDemoMode()) { setRemote(null); return; }
    setLoading(true); setMessage("");
    try {
      const body = await apiJson<{ items: InventoryItem[] }>("/api/inventory");
      setRemote(body.items);
    } catch (error) { setMessage(formatApiError(error, "Falha ao carregar estoque.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function applyAdjustment() {
    if (!pending) return;
    if (reason.trim().length < 2) { setMessage("Informe o motivo do ajuste."); return; }
    const nextQuantity = pending.item.quantity + pending.delta;
    if (!pending.item.allowNegative && nextQuantity < 0) { setMessage("Este item não pode ficar com estoque negativo."); return; }
    setWorking(pending.item.id); setMessage("");
    try {
      if (isDemoMode()) demoActions.updateInventory(pending.item.id, pending.delta, reason.trim());
      else {
        await apiJson<{ quantity: number }>(`/api/inventory/${pending.item.id}`, { method: "POST", body: JSON.stringify({ delta: pending.delta, reason: reason.trim(), idempotencyKey: uid("stock") }) });
        await load();
        requestOperationalRefresh();
      }
      setPending(null); setReason(""); setMessage("Ajuste registrado com auditoria.");
    } catch (error) { setMessage(formatApiError(error, "Falha ao ajustar estoque.")); }
    finally { setWorking(""); }
  }

  return <>
    <PageHeader title="Estoque de bebidas e sobremesas" icon={Boxes} description="Estoque real e auditável somente para bebidas e sobremesas. Todo ajuste exige motivo e é revalidado no servidor." actions={<button className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={17} className={loading ? "animate-spin" : ""}/>Atualizar</button>} />
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><Kpi label="Itens controlados" value={inventory.length}/><Kpi label="Abaixo do mínimo" value={lowCount} warning={lowCount > 0}/><Kpi label="Sem estoque" value={outCount} danger={outCount > 0}/></div>
    <div className="surface mb-5 p-4"><label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={17}/><input className="input pl-9" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar bebida ou sobremesa"/></label></div>
    {message && <p className={`mb-4 rounded-xl p-3 text-sm font-semibold ${/falha|erro|não pode|informe/i.test(message)?"bg-red-50 text-red-700":"bg-emerald-50 text-emerald-800"}`}>{message}</p>}
    <div className="grid gap-3 lg:grid-cols-2">{items.map((item)=>{const low=item.quantity<=item.minQuantity;return <article key={item.id} className={`surface flex items-center gap-4 p-4 ${low?"border-amber-200 bg-amber-50":""}`}><div className={`grid h-12 w-12 place-items-center rounded-2xl ${low?"bg-amber-100 text-amber-800":"bg-basso-cream text-basso-wine"}`}>{low?<AlertTriangle/>:<Boxes/>}</div><div className="min-w-0 flex-1"><strong className="block truncate">{item.name}</strong><p className="mt-1 text-xs text-black/40">Mínimo: {item.minQuantity} {item.unit}(s) • Atualizado {shortDateTime(item.updatedAt)}</p></div><div className="flex items-center rounded-xl border bg-white"><button className="p-2 disabled:opacity-40" disabled={working===item.id||(!item.allowNegative&&item.quantity<=0)} onClick={()=>{setPending({item,delta:-1});setReason("")}} aria-label={`Retirar uma unidade de ${item.name}`}><Minus size={16}/></button><strong className="w-12 text-center">{item.quantity}</strong><button className="p-2 disabled:opacity-40" disabled={working===item.id} onClick={()=>{setPending({item,delta:1});setReason("")}} aria-label={`Adicionar uma unidade de ${item.name}`}><Plus size={16}/></button></div></article>})}{!items.length&&<p className="surface p-8 text-center text-sm text-black/45">Nenhum item encontrado.</p>}</div>
    {pending&&<div className="fixed inset-0 z-[120] grid place-items-center bg-black/50 p-4"><section className="surface w-full max-w-md p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.12em] text-black/35">Ajuste de estoque</p><h2 className="mt-1 font-display text-2xl font-bold">{pending.item.name}</h2><p className="mt-1 text-sm text-black/50">{pending.delta>0?"Entrada manual":"Saída manual"} de {Math.abs(pending.delta)} {pending.item.unit}(s).</p></div><button className="btn-ghost" onClick={()=>setPending(null)}><X size={18}/></button></div><label className="mt-5 block"><span className="label">Motivo obrigatório</span><textarea className="textarea" value={reason} onChange={(event)=>setReason(event.target.value)} maxLength={300} placeholder="Ex.: reposição recebida, perda, conferência física…"/></label><button className="btn-primary mt-5 w-full" disabled={working===pending.item.id} onClick={()=>void applyAdjustment()}>{working===pending.item.id?<Loader2 className="animate-spin" size={17}/>:pending.delta>0?<Plus size={17}/>:<Minus size={17}/>}Confirmar e auditar</button></section></div>}
  </>;
}
function Kpi({label,value,warning,danger}:{label:string;value:number;warning?:boolean;danger?:boolean}){return <div className={`surface p-4 ${danger?"border-red-200 bg-red-50":warning?"border-amber-200 bg-amber-50":""}`}><p className="text-xs font-bold uppercase text-black/40">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>}
