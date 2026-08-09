"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type LucideIcon,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CupSoda,
  Loader2,
  PackageCheck,
  Pizza,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
} from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { isDemoMode, shortDateTime } from "@/lib/utils";
import type { Address, ExpeditionStatus } from "@/types";

type ExpeditionItem = {
  id: string;
  order_id: string;
  name_snapshot: string;
  quantity: number;
  sector: string;
  production_status: string;
  selection?: Record<string, unknown>;
};

type ExpeditionOrder = {
  id: string;
  number: number;
  channel: string;
  status: string;
  payment_status: string;
  customer_name: string;
  customer_phone: string;
  address?: Partial<Address>;
  total_cents: number;
  payment_method: string;
  change_for_cents?: number;
  expedition_status: ExpeditionStatus;
  expedition_notes?: string;
  created_at: string;
  updated_at: string;
  items: ExpeditionItem[];
};

const demoOrders: ExpeditionOrder[] = [
  { id: "order_1048", number: 1048, channel: "own_delivery", status: "ready", payment_status: "paid", customer_name: "Maria Souza", customer_phone: "11970000000", address: { street: "Rua das Flores", number: "120", district: "Centro", complement: "Casa 2" }, total_cents: 7850, payment_method: "pix", expedition_status: "pending", created_at: new Date(Date.now() - 48 * 60_000).toISOString(), updated_at: new Date(Date.now() - 5 * 60_000).toISOString(), items: [
    { id: "i1", order_id: "order_1048", name_snapshot: "Pizza Grande • Calabresa Tradicional", quantity: 1, sector: "kitchen", production_status: "ready" },
    { id: "i2", order_id: "order_1048", name_snapshot: "Coca-Cola 2 L", quantity: 1, sector: "bar", production_status: "ready" },
  ] },
  { id: "order_1049", number: 1049, channel: "pickup", status: "ready", payment_status: "pending", customer_name: "Carlos Lima", customer_phone: "11971111111", total_cents: 6500, payment_method: "cash", expedition_status: "checking", created_at: new Date(Date.now() - 35 * 60_000).toISOString(), updated_at: new Date(Date.now() - 3 * 60_000).toISOString(), items: [
    { id: "i3", order_id: "order_1049", name_snapshot: "Pizza Grande • Margherita", quantity: 1, sector: "kitchen", production_status: "ready" },
  ] },
];

export default function ExpeditionPage() {
  const [orders, setOrders] = useState<ExpeditionOrder[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      if (isDemoMode()) {
        setOrders((current) => current.length ? current : demoOrders);
        setSelected((current) => current || demoOrders[0]?.id || null);
        return;
      }
      const response = await fetch("/api/expedition", { cache: "no-store" });
      const body = (await response.json()) as { orders?: ExpeditionOrder[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao consultar expedição.");
      const data = body.orders || [];
      setOrders(data);
      setSelected((current) => current && data.some((order) => order.id === current) ? current : data[0]?.id || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao consultar expedição.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => orders.filter((order) => {
    const haystack = `${order.number} ${order.customer_name} ${order.customer_phone} ${order.channel}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }), [orders, query]);
  const current = orders.find((order) => order.id === selected) || null;
  const requiredChecks = current ? ["items", "beverages", "payment", current.channel === "own_delivery" ? "address" : "customer"] : [];
  const allChecked = requiredChecks.every((key) => checks[`${current?.id}:${key}`]);

  function toggleCheck(key: string) {
    if (!current) return;
    const id = `${current.id}:${key}`;
    setChecks((state) => ({ ...state, [id]: !state[id] }));
  }

  async function update(status: ExpeditionStatus) {
    if (!current) return;
    if (status === "approved" && !allChecked) {
      setMessage("Conclua todas as conferências antes de liberar o pedido.");
      return;
    }
    if (status === "returned" && notes.trim().length < 2) {
      setMessage("Informe o motivo para devolver o pedido à produção.");
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      if (!isDemoMode()) {
        const response = await fetch(`/api/expedition/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, notes: notes.trim() || undefined }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao atualizar expedição.");
      }
      setOrders((list) => list.map((order) => order.id === current.id ? { ...order, expedition_status: status, expedition_notes: notes.trim() || undefined, updated_at: new Date().toISOString() } : order));
      setMessage(status === "approved" ? "Pedido conferido e liberado para retirada ou despacho." : status === "returned" ? "Pedido devolvido à produção com motivo registrado." : "Conferência iniciada.");
      if (status === "approved") setSelected(filtered.find((order) => order.id !== current.id && order.expedition_status !== "approved")?.id || current.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar expedição.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageHeader title="Expedição" icon={PackageCheck} description="Confira itens, bebidas, observações, pagamento, troco e destino antes de liberar cada pedido para retirada ou delivery." actions={<button className="btn-secondary" onClick={load}><RefreshCw size={17} />Atualizar fila</button>} />
      {message && <p className={`mb-5 rounded-2xl p-4 text-sm font-semibold ${/falha|erro|informe|conclua/i.test(message) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</p>}
      <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <section className="surface overflow-hidden"><div className="border-b border-black/5 p-4"><label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={17} /><input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pedido, cliente ou telefone" /></label></div><div className="max-h-[calc(100vh-230px)] divide-y divide-black/5 overflow-y-auto">{loading && <div className="grid min-h-56 place-items-center"><Loader2 className="animate-spin text-basso-wine" size={32} /></div>}{!loading && filtered.map((order) => <button key={order.id} onClick={() => { setSelected(order.id); setNotes(order.expedition_notes || ""); }} className={`flex w-full items-center gap-3 p-4 text-left transition hover:bg-basso-paper ${selected === order.id ? "bg-basso-cream/70" : ""}`}><span className={`grid h-11 w-11 place-items-center rounded-2xl ${order.expedition_status === "approved" ? "bg-emerald-100 text-emerald-700" : order.expedition_status === "returned" ? "bg-red-100 text-red-700" : order.expedition_status === "checking" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}>{order.expedition_status === "approved" ? <CheckCircle2 size={20} /> : <PackageCheck size={20} />}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><strong>#{order.number}</strong><span className="text-[9px] font-black uppercase text-black/35">{order.channel}</span></div><p className="truncate text-sm text-black/55">{order.customer_name}</p><p className="text-[10px] text-black/35">{order.items.length} item(ns) • {shortDateTime(order.created_at)}</p></div><ChevronRight size={17} className="text-black/20" /></button>)}{!loading && !filtered.length && <p className="p-8 text-center text-sm text-black/45">Nenhum pedido aguardando expedição.</p>}</div></section>
        <section className="surface min-h-[560px] overflow-hidden">{!current ? <div className="grid min-h-[560px] place-items-center text-center"><div><PackageCheck className="mx-auto text-black/20" size={42} /><p className="mt-3 font-bold">Selecione um pedido</p><p className="text-sm text-black/45">A conferência completa aparecerá aqui.</p></div></div> : <><div className="border-b border-black/5 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="font-display text-3xl font-bold">Pedido #{current.number}</h2><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${current.expedition_status === "approved" ? "bg-emerald-50 text-emerald-700" : current.expedition_status === "returned" ? "bg-red-50 text-red-700" : current.expedition_status === "checking" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800"}`}>{current.expedition_status}</span></div><p className="mt-1 text-sm text-black/45">{current.customer_name} • {current.customer_phone} • {current.channel}</p></div><div className="text-right"><p className="text-xs text-black/40">Total</p><p className="text-2xl font-black">{(current.total_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p><p className={`text-xs font-bold ${current.payment_status === "paid" ? "text-emerald-700" : "text-amber-700"}`}>{current.payment_status === "paid" ? "Pago" : "Pagamento pendente"}</p></div></div></div>
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_330px]"><div><h3 className="font-display text-xl font-bold">Itens do pedido</h3><div className="mt-3 space-y-3">{current.items.map((item) => <article key={item.id} className="rounded-2xl border border-black/5 bg-basso-paper/70 p-4"><div className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.sector === "bar" ? "bg-blue-100 text-blue-700" : "bg-basso-cream text-basso-wine"}`}>{item.sector === "bar" ? <CupSoda size={18} /> : <Pizza size={18} />}</span><div className="min-w-0 flex-1"><p className="font-bold">{item.quantity}× {item.name_snapshot}</p><p className="mt-1 text-xs text-black/45">Setor {item.sector} • produção {item.production_status}</p>{item.selection && Object.keys(item.selection).length > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs font-bold text-basso-wine">Ver montagem</summary><pre className="mt-2 overflow-x-auto rounded-xl bg-white p-3 text-[10px] text-black/60">{JSON.stringify(item.selection, null, 2)}</pre></details>}</div><CheckCircle2 size={19} className={item.production_status === "ready" ? "text-emerald-600" : "text-amber-600"} /></div></article>)}</div>
        {current.address && <div className="mt-5 rounded-2xl border border-black/5 p-4"><h3 className="font-bold">Endereço e referência</h3><p className="mt-2 text-sm text-black/55">{String(current.address.street || "")}, {String(current.address.number || "")} • {String(current.address.district || "")}</p>{current.address.complement && <p className="text-sm text-black/55">Complemento: {String(current.address.complement)}</p>}{current.address.reference && <p className="text-sm text-black/55">Referência: {String(current.address.reference)}</p>}</div>}</div>
        <aside><h3 className="font-display text-xl font-bold">Checklist de liberação</h3><div className="mt-3 space-y-2"><CheckButton checked={Boolean(checks[`${current.id}:items`])} onClick={() => toggleCheck("items")} icon={ShoppingBag} label="Todos os itens conferidos" /><CheckButton checked={Boolean(checks[`${current.id}:beverages`])} onClick={() => toggleCheck("beverages")} icon={CupSoda} label="Bebidas e sobremesas conferidas" /><CheckButton checked={Boolean(checks[`${current.id}:payment`])} onClick={() => toggleCheck("payment")} icon={ClipboardCheck} label="Pagamento e troco conferidos" /><CheckButton checked={Boolean(checks[`${current.id}:${current.channel === "own_delivery" ? "address" : "customer"}`])} onClick={() => toggleCheck(current.channel === "own_delivery" ? "address" : "customer")} icon={Search} label={current.channel === "own_delivery" ? "Endereço e referência conferidos" : "Cliente / retirada conferidos"} /></div><label className="mt-4 block"><span className="label">Observação da expedição</span><textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Obrigatória em caso de devolução" /></label><div className="mt-4 grid gap-2"><button className="btn-secondary" disabled={working} onClick={() => update("checking")}><ClipboardCheck size={17} />Iniciar conferência</button><button className="btn-primary" disabled={working || !allChecked} onClick={() => update("approved")}>{working ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}Liberar pedido</button><button className="btn-secondary border-red-200 text-red-700" disabled={working} onClick={() => update("returned")}><RotateCcw size={17} />Devolver à produção</button></div>{!allChecked && <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-amber-700"><AlertTriangle className="mt-0.5 shrink-0" size={15} />Conclua os quatro pontos antes de liberar.</p>}</aside></div></>}</section>
      </div>
    </>
  );
}

function CheckButton({ checked, onClick, icon: Icon, label }: { checked: boolean; onClick: () => void; icon: LucideIcon; label: string }) { return <button type="button" onClick={onClick} className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm font-bold transition ${checked ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-black/10 bg-white text-black/55"}`}><span className={`grid h-8 w-8 place-items-center rounded-lg ${checked ? "bg-emerald-600 text-white" : "bg-black/[.04]"}`}>{checked ? <Check size={16} /> : <Icon size={16} />}</span>{label}</button>; }
