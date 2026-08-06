"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Download, Grid2X2, KanbanSquare, List, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { OrderCard } from "@/components/internal/OrderCard";
import { OrderDetailPanel } from "@/components/internal/OrderDetailPanel";
import { useDemoState, demoActions } from "@/lib/demo-store";
import { allowedStatuses, channelLabel, statusLabel } from "@/lib/order-validation";
import { currency, isDemoMode, shortDateTime } from "@/lib/utils";
import type { Order, OrderChannel, OrderStatus } from "@/types";

const activeStatuses: OrderStatus[] = ["received", "confirmed", "preparing", "ready", "out_for_delivery"];
type ViewMode = "kanban" | "list" | "cards";

function OrdersContent() {
  const searchParams = useSearchParams();
  const orders = useDemoState((state) => state.orders);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | OrderStatus>("all");
  const [channel, setChannel] = useState<"all" | OrderChannel>("all");
  const [payment, setPayment] = useState("all");
  const [attention, setAttention] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [view, setView] = useState<ViewMode>("kanban");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("lfb-orders-view") as ViewMode | null;
    if (stored && ["kanban", "list", "cards"].includes(stored)) setView(stored);
    const requested = searchParams.get("order");
    if (requested) setSelectedId(requested);
  }, [searchParams]);

  const filtered = useMemo(() => orders.filter((order) => {
    const haystack = `${order.number} ${order.customerName} ${order.customerPhone} ${order.address?.district || ""} ${order.tableNumber || ""}`.toLowerCase();
    const minutes = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
    return (status === "all" || order.status === status)
      && (channel === "all" || order.channel === channel)
      && (payment === "all" || order.paymentStatus === payment)
      && (!attention || (activeStatuses.includes(order.status) && (minutes >= 45 || order.priority === "urgent")))
      && (!query || haystack.includes(query.toLowerCase()));
  }), [orders, status, channel, payment, attention, query]);

  const stats = useMemo(() => ({
    new: orders.filter((order) => order.status === "received").length,
    preparing: orders.filter((order) => order.status === "preparing").length,
    ready: orders.filter((order) => order.status === "ready").length,
    delivery: orders.filter((order) => order.status === "out_for_delivery").length,
    pendingPayment: orders.filter((order) => !["paid", "refunded", "cancelled"].includes(order.paymentStatus)).reduce((sum, order) => sum + order.total, 0),
  }), [orders]);

  function changeView(next: ViewMode) { setView(next); localStorage.setItem("lfb-orders-view", next); }
  function refresh() { if (isDemoMode()) demoActions.reset(); else window.dispatchEvent(new Event("lfb:refresh-operation")); }
  function exportCsv() {
    const rows = [["Pedido", "Canal", "Status", "Cliente", "Telefone", "Total", "Pagamento", "Criado"], ...filtered.map((order) => [String(order.number), channelLabel[order.channel], statusLabel[order.status], order.customerName, order.customerPhone, String(order.total / 100).replace(".", ","), order.paymentStatus, shortDateTime(order.createdAt)])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  return <>
    <PageHeader title="Central de pedidos" icon={ClipboardList} description="Controle cada etapa, item, pagamento, comunicação, impressão, ocorrência e responsável da comanda em uma única tela." actions={<><button className="btn-secondary" onClick={exportCsv}><Download size={17}/>Exportar</button><button className="btn-secondary" onClick={refresh}><RefreshCw size={17}/>Atualizar</button></>}/>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Kpi label="Novos" value={stats.new} tone="warning"/><Kpi label="Em preparo" value={stats.preparing}/><Kpi label="Prontos" value={stats.ready} tone="success"/><Kpi label="Em entrega" value={stats.delivery}/><Kpi label="A receber" value={currency(stats.pendingPayment)} tone={stats.pendingPayment ? "warning" : "success"}/></div>
    <section className="surface mb-5 p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_190px_190px_auto]">
        <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35" size={17}/><input className="input pl-9" placeholder="Buscar pedido, cliente, telefone, bairro ou mesa" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
        <select className="input" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">Todos os status</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select className="input" value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}><option value="all">Todos os canais</option>{Object.entries(channelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button className={`btn-secondary ${advanced ? "border-basso-wine bg-basso-wine/5" : ""}`} onClick={() => setAdvanced((value) => !value)}><SlidersHorizontal size={17}/>Mais filtros</button>
      </div>
      {advanced && <div className="mt-3 grid gap-3 border-t border-black/5 pt-3 sm:grid-cols-3"><select className="input" value={payment} onChange={(event) => setPayment(event.target.value)}><option value="all">Todos os pagamentos</option><option value="pending">Pendente</option><option value="partial">Parcial</option><option value="paid">Pago</option><option value="refunded">Estornado</option><option value="cancelled">Cancelado</option></select><label className="flex h-11 items-center gap-3 rounded-xl border border-black/10 bg-white px-3 text-sm font-semibold"><input type="checkbox" checked={attention} onChange={(event) => setAttention(event.target.checked)}/>Somente pedidos que exigem atenção</label><button className="btn-ghost" onClick={() => { setQuery(""); setStatus("all"); setChannel("all"); setPayment("all"); setAttention(false); }}>Limpar filtros</button></div>}
    </section>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-black/50">{filtered.length} pedido(s) encontrado(s)</p><div className="flex rounded-xl border bg-white p-1"><ViewButton active={view === "kanban"} onClick={() => changeView("kanban")} icon={<KanbanSquare size={16}/>} label="Kanban"/><ViewButton active={view === "list"} onClick={() => changeView("list")} icon={<List size={16}/>} label="Lista"/><ViewButton active={view === "cards"} onClick={() => changeView("cards")} icon={<Grid2X2 size={16}/>} label="Cards"/></div></div>
    {view === "kanban" && <Kanban orders={filtered} onOpen={(order) => setSelectedId(order.id)}/>} 
    {view === "list" && <OrderList orders={filtered} onOpen={(order) => setSelectedId(order.id)}/>} 
    {view === "cards" && <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{filtered.map((order) => <OrderCard key={order.id} order={order} onOpen={() => setSelectedId(order.id)}/>)}</div>}
    {!filtered.length && <div className="surface p-10 text-center"><p className="font-display text-2xl font-bold">Nenhum pedido encontrado</p><p className="mt-2 text-sm text-black/50">Altere os filtros para visualizar outros pedidos.</p></div>}
    <OrderDetailPanel orderId={selectedId} onClose={() => setSelectedId(null)}/>
  </>;
}

export default function OrdersPage() {
  return <Suspense fallback={<div className="surface p-8 text-center"><p className="font-display text-xl font-bold">Carregando pedidos…</p><p className="mt-2 text-sm text-black/50">Preparando filtros e comandas.</p></div>}><OrdersContent/></Suspense>;
}

function Kanban({ orders, onOpen }: { orders: Order[]; onOpen: (order: Order) => void }) {
  const columns: Array<{ status: OrderStatus; label: string }> = [
    { status: "received", label: "Recebidos" }, { status: "confirmed", label: "Confirmados" }, { status: "preparing", label: "Em preparo" }, { status: "ready", label: "Prontos" }, { status: "out_for_delivery", label: "Em entrega" },
  ];
  return <div className="scrollbar-none flex gap-4 overflow-x-auto pb-4">{columns.map((column) => { const rows = orders.filter((order) => order.status === column.status); return <section key={column.status} className="w-[330px] shrink-0 rounded-3xl border border-black/5 bg-black/[.025] p-3"><div className="mb-3 flex items-center justify-between px-2"><h2 className="font-display text-xl font-bold">{column.label}</h2><span className="rounded-full bg-white px-2.5 py-1 text-xs font-black">{rows.length}</span></div><div className="space-y-3">{rows.map((order) => <OrderCard key={order.id} order={order} compact onOpen={onOpen}/>)}{!rows.length && <div className="rounded-2xl border border-dashed border-black/10 p-8 text-center text-xs text-black/35">Sem pedidos nesta etapa</div>}</div></section>; })}<section className="w-[330px] shrink-0 rounded-3xl border border-black/5 bg-black/[.025] p-3"><div className="mb-3 flex items-center justify-between px-2"><h2 className="font-display text-xl font-bold">Encerrados</h2><span className="rounded-full bg-white px-2.5 py-1 text-xs font-black">{orders.filter((order) => ["completed", "cancelled"].includes(order.status)).length}</span></div><div className="space-y-3">{orders.filter((order) => ["completed", "cancelled"].includes(order.status)).slice(0, 12).map((order) => <OrderCard key={order.id} order={order} compact onOpen={onOpen}/>)}</div></section></div>;
}

function OrderList({ orders, onOpen }: { orders: Order[]; onOpen: (order: Order) => void }) { return <div className="surface overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-basso-black text-white"><tr>{["Pedido", "Cliente", "Canal", "Etapa", "Itens", "Pagamento", "Total", "Entrada", ""].map((label) => <th key={label} className="px-4 py-3 text-xs uppercase">{label}</th>)}</tr></thead><tbody className="divide-y">{orders.map((order) => <tr key={order.id} className="hover:bg-basso-paper"><td className="px-4 py-3 font-black">#{order.number}</td><td className="px-4 py-3"><strong>{order.customerName}</strong><p className="text-xs text-black/40">{order.customerPhone}</p></td><td className="px-4 py-3">{channelLabel[order.channel]}</td><td className="px-4 py-3"><span className="rounded-full bg-basso-paper px-2 py-1 text-xs font-bold">{statusLabel[order.status]}</span></td><td className="px-4 py-3">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td><td className="px-4 py-3">{order.paymentStatus}</td><td className="px-4 py-3 font-bold text-basso-wine">{currency(order.total)}</td><td className="px-4 py-3 text-xs text-black/50">{shortDateTime(order.createdAt)}</td><td className="px-4 py-3"><button className="btn-ghost" onClick={() => onOpen(order)}>Administrar</button></td></tr>)}</tbody></table></div></div>; }
function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button className={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold ${active ? "bg-basso-wine text-white" : "text-black/45 hover:bg-black/5"}`} onClick={onClick}>{icon}{label}</button>; }
function Kpi({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "warning" | "success" }) { return <div className={`surface p-4 ${tone === "warning" ? "border-amber-200 bg-amber-50" : tone === "success" ? "border-emerald-200 bg-emerald-50" : ""}`}><p className="text-xs font-black uppercase text-black/40">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>; }
