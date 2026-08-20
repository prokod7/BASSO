"use client";

import dynamic from "next/dynamic";
import { ReactNode, useMemo, useState } from "react";
import { Bike, CheckCircle2, Clock3, Crosshair, ExternalLink, MapPin, MessageCircle, Navigation, PackageCheck, PhoneCall, RefreshCw, Search, ShieldCheck, Truck, UserRoundCheck } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { OrderDetailPanel } from "@/components/internal/OrderDetailPanel";
import type { MapPoint } from "@/components/maps/OperationalMap";
import { demoActions } from "@/lib/demo-store";
import { useStableDemoState } from "@/lib/stable-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { currency, isDemoMode, shortDateTime } from "@/lib/utils";
import type { Driver, Order, OrderStatus } from "@/types";

const OperationalMap = dynamic(() => import("@/components/maps/OperationalMap").then((module) => module.OperationalMap), { ssr: false });

const statusLabel: Record<OrderStatus, string> = {
  received: "Recebido", confirmed: "Confirmado", preparing: "Em preparo", ready: "Pronto para despacho",
  out_for_delivery: "Em entrega", completed: "Concluído", cancelled: "Cancelado",
};

function safePhone(value?: string) {
  return String(value || "").replace(/\D/g, "");
}

function formatAddress(order: Order) {
  if (!order.address) return "Endereço não informado";
  const parts = [
    [order.address.street, order.address.number].filter(Boolean).join(", "),
    order.address.district,
    order.address.complement,
    order.address.reference ? `Ref.: ${order.address.reference}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" • ") : "Endereço incompleto";
}

function navigationUrl(order: Order) {
  const address = order.address;
  if (!address) return "";
  if (typeof address.latitude === "number" && typeof address.longitude === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${address.latitude},${address.longitude}`;
  }
  const text = [address.street, address.number, address.district, address.city, address.state].filter(Boolean).join(", ");
  return text ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}` : "";
}

function minutesSince(value?: string) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
}

export default function DeliveryPage() {
  const store = useStableDemoState((state) => state);
  const orders = useMemo(() => store.orders.filter((order) => order.channel === "own_delivery" && !["completed", "cancelled"].includes(order.status)), [store.orders]);
  const drivers = store.drivers;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "ready" | "out_for_delivery" | "unassigned" | "delayed">("all");
  const [selected, setSelected] = useState<Order | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [showMap, setShowMap] = useState(false);

  const filtered = useMemo(() => orders.filter((order) => {
    if (status === "unassigned" && order.driverId) return false;
    if (status === "delayed") {
      const minutes = minutesSince(order.updatedAt || order.createdAt) || 0;
      if (minutes < 45) return false;
    } else if (status !== "all" && status !== "unassigned" && order.status !== status) return false;
    const term = query.trim().toLowerCase();
    const address = order.address;
    const haystack = `${order.number} ${order.customerName || ""} ${order.customerPhone || ""} ${address?.street || ""} ${address?.district || ""}`.toLowerCase();
    return !term || haystack.includes(term);
  }), [orders, query, status]);

  const metrics = {
    total: orders.length,
    ready: orders.filter((order) => order.status === "ready").length,
    unassigned: orders.filter((order) => order.status === "ready" && !order.driverId).length,
    onRoute: orders.filter((order) => order.status === "out_for_delivery").length,
  };

  async function assign(order: Order, driverId: string) {
    if (!driverId) return;
    setBusy(`assign-${order.id}`); setMessage("");
    try {
      if (isDemoMode()) demoActions.assignDriver(order.id, driverId);
      else {
        await apiJson("/api/delivery/assign", { method: "POST", body: JSON.stringify({ orderId: order.id, driverId }) });
        requestOperationalRefresh();
      }
      setMessage(`Pedido #${order.number} atribuído ao motoboy.`);
    } catch (error) {
      setMessage(formatApiError(error, "Falha ao atribuir entrega."));
      requestOperationalRefresh();
    } finally { setBusy(""); }
  }

  async function changeStatus(order: Order, next: OrderStatus, reason: string) {
    setBusy(`status-${order.id}`); setMessage("");
    try {
      if (isDemoMode()) demoActions.updateOrderStatus(order.id, next, "Despacho");
      else {
        await apiJson(`/api/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next, reason, expectedVersion: order.version }) });
        requestOperationalRefresh();
      }
      setMessage(next === "out_for_delivery" ? `Pedido #${order.number} saiu para entrega.` : `Pedido #${order.number} concluído.`);
    } catch (error) {
      setMessage(formatApiError(error, "Falha ao atualizar entrega."));
      requestOperationalRefresh();
    } finally { setBusy(""); }
  }

  function whatsapp(order: Order) {
    const phone = safePhone(order.customerPhone);
    if (phone.length < 10) { setMessage("O pedido não possui telefone válido."); return; }
    const text = order.status === "out_for_delivery"
      ? `Olá, ${order.customerName || "cliente"}! Seu pedido #${order.number} saiu para entrega.`
      : `Olá, ${order.customerName || "cliente"}! Estamos organizando a entrega do pedido #${order.number}.`;
    window.open(`https://wa.me/55${phone.replace(/^55/, "")}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  const points: MapPoint[] = useMemo(() => [
    ...orders.filter((order) => Number.isFinite(order.address?.latitude) && Number.isFinite(order.address?.longitude)).map((order) => ({
      id: `destination-${order.id}`, latitude: Number(order.address!.latitude), longitude: Number(order.address!.longitude), label: `Destino #${order.number}`, kind: "destination" as const,
    })),
    ...drivers.filter((driver) => Number.isFinite(driver.latitude) && Number.isFinite(driver.longitude)).map((driver) => ({
      id: driver.id, latitude: Number(driver.latitude), longitude: Number(driver.longitude), label: driver.name, kind: "driver" as const, updatedAt: driver.lastLocationAt,
    })),
  ], [orders, drivers]);

  return <>
    <PageHeader title="Delivery e despacho" icon={Bike} description="Despacho resiliente: pedidos prontos, atribuição de motoboy, endereço, recebimento e acompanhamento sem depender do mapa." actions={<button className="btn-secondary" onClick={() => requestOperationalRefresh()}><RefreshCw size={17} />Atualizar</button>} />
    {message && <p className="mb-4 rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</p>}

    <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Entregas abertas" value={metrics.total} icon={<Truck />} />
      <Metric label="Prontas" value={metrics.ready} icon={<PackageCheck />} />
      <Metric label="Sem motoboy" value={metrics.unassigned} icon={<UserRoundCheck />} alert={metrics.unassigned > 0} />
      <Metric label="Na rua" value={metrics.onRoute} icon={<Navigation />} />
    </div>

    <section className="surface mb-5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={17} /><input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pedido, cliente, telefone, rua ou bairro" /></label>
        <select className="input lg:w-56" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">Todas as entregas</option><option value="unassigned">Sem motoboy</option><option value="ready">Prontas</option><option value="out_for_delivery">Em entrega</option><option value="delayed">Com atenção</option>
        </select>
        <button className="btn-secondary" onClick={() => setShowMap((current) => !current)}><MapPin size={17} />{showMap ? "Ocultar mapa" : "Mostrar mapa"}</button>
      </div>
    </section>

    {showMap && <section className="surface mb-5 overflow-hidden p-3">
      {points.length ? <OperationalMap points={points} className="h-96" /> : <div className="grid h-64 place-items-center rounded-2xl bg-basso-paper text-center"><div><MapPin className="mx-auto text-black/25" size={34} /><p className="mt-2 text-sm font-bold">Nenhuma coordenada disponível</p><p className="mt-1 text-xs text-black/45">A operação continua disponível pelo endereço textual.</p></div></div>}
    </section>}

    <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
      <section className="space-y-4">
        {filtered.map((order) => <DeliveryCard key={order.id} order={order} drivers={drivers} busy={busy} onAssign={(driverId) => void assign(order, driverId)} onOpen={() => setSelected(order)} onWhatsApp={() => whatsapp(order)} onStart={() => void changeStatus(order, "out_for_delivery", "Entrega iniciada pelo despacho")} onComplete={() => void changeStatus(order, "completed", "Entrega concluída pelo despacho")} />)}
        {!filtered.length && <div className="surface p-10 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={36} /><p className="mt-3 font-bold">Nenhuma entrega neste filtro</p><p className="mt-1 text-sm text-black/45">Os próximos pedidos aparecerão aqui.</p></div>}
      </section>
      <aside className="space-y-4">
        <div className="surface p-5"><h2 className="font-display text-xl font-bold">Motoboys</h2><div className="mt-4 space-y-3">{drivers.map((driver) => <DriverCard key={driver.id} driver={driver} />)}{!drivers.length && <p className="text-sm text-black/45">Nenhum motoboy ativo.</p>}</div></div>
        <p className="rounded-xl bg-basso-paper p-4 text-xs text-black/50"><Navigation size={15} className="mr-1 inline" />O motoboy pode escolher a ordem dos pedidos prontos no PWA; o despacho também pode atribuir manualmente quando necessário.</p>
      </aside>
    </div>
    {selected && <OrderDetailPanel orderId={selected.id} onClose={() => setSelected(null)} />}
  </>;
}

function DeliveryCard({ order, drivers, busy, onAssign, onOpen, onWhatsApp, onStart, onComplete }: { order: Order; drivers: Driver[]; busy: string; onAssign: (driverId: string) => void; onOpen: () => void; onWhatsApp: () => void; onStart: () => void; onComplete: () => void; }) {
  const assigned = drivers.find((driver) => driver.id === order.driverId);
  const navigation = navigationUrl(order);
  const minutes = minutesSince(order.updatedAt || order.createdAt);
  const phone = safePhone(order.customerPhone);
  return <article className={`surface overflow-hidden ${order.status === "ready" && !order.driverId ? "ring-2 ring-amber-300" : ""}`}>
    <div className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-black uppercase text-basso-wine">Pedido #{order.number}</p><span className="rounded-full bg-black/5 px-2 py-1 text-[10px] font-bold">{statusLabel[order.status]}</span>{order.paymentStatus !== "paid" && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">Recebimento pendente</span>}{minutes != null && minutes >= 45 && <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">{minutes} min nesta etapa</span>}</div>
          <h2 className="mt-2 font-display text-xl font-bold">{order.customerName || "Cliente"}</h2>
          <p className="mt-2 flex items-start gap-2 text-sm text-black/55"><MapPin size={16} className="mt-0.5 shrink-0" />{formatAddress(order)}</p>
          <p className="mt-2 text-xs text-black/40">{currency(order.total || 0)} • {String(order.paymentMethod || "").toUpperCase()} • entrou {shortDateTime(order.createdAt)}</p>
          {order.changeFor && order.paymentMethod === "cash" && <p className="mt-1 text-xs font-bold text-amber-800">Troco para {currency(order.changeFor)}</p>}
        </div>
        <select className="input sm:w-64" value={order.driverId || ""} disabled={busy === `assign-${order.id}` || order.status === "out_for_delivery"} onChange={(event) => onAssign(event.target.value)}>
          <option value="">Atribuir motoboy</option>
          {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name} • {driver.shiftActive ? (driver.available || driver.id === order.driverId ? "disponível" : "em entrega") : "turno fechado"}</option>)}
        </select>
      </div>
      {assigned && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"><ShieldCheck size={16} />{assigned.name} • {assigned.vehicle}</div>}
    </div>
    <div className="flex flex-wrap gap-2 border-t bg-black/[.015] p-4">
      <button className="btn-secondary" onClick={onOpen}>Administrar comanda</button>
      <button className="btn-ghost" onClick={onWhatsApp} disabled={phone.length < 10}><MessageCircle size={16} />WhatsApp</button>
      {phone.length >= 10 && <a className="btn-ghost" href={`tel:${phone}`}><PhoneCall size={16} />Ligar</a>}
      {navigation && <a className="btn-ghost" href={navigation} target="_blank" rel="noreferrer"><ExternalLink size={16} />Navegação</a>}
      {order.status === "ready" && <button className="btn-primary ml-auto" disabled={!order.driverId || busy === `status-${order.id}`} onClick={onStart}><Bike size={16} />Iniciar entrega</button>}
      {order.status === "out_for_delivery" && <button className="btn-primary ml-auto" disabled={busy === `status-${order.id}`} onClick={onComplete}><CheckCircle2 size={16} />Pedido entregue</button>}
    </div>
  </article>;
}

function DriverCard({ driver }: { driver: Driver }) {
  const staleMinutes = minutesSince(driver.lastLocationAt);
  const label = !driver.shiftActive ? "Turno fechado" : driver.available ? "Disponível" : "Em entrega";
  const statusClass = !driver.shiftActive ? "bg-stone-100 text-stone-600" : driver.available ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800";
  return <div className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><strong>{driver.name}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass}`}>{label}</span></div><p className="mt-1 text-xs text-black/45">{driver.vehicle} • {driver.phone || "sem telefone"}</p>{driver.lastLocationAt && <p className={`mt-1 flex items-center gap-1 text-[11px] ${staleMinutes != null && staleMinutes >= 2 ? "font-bold text-red-700" : "text-black/40"}`}><Crosshair size={12} />Última posição: {shortDateTime(driver.lastLocationAt)}{staleMinutes != null && staleMinutes >= 2 ? " • GPS desatualizado" : ""}</p>}{driver.activeOrderId && <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-basso-wine"><Clock3 size={12} />Com uma entrega em andamento</p>}</div>;
}

function Metric({ label, value, icon, alert = false }: { label: string; value: number; icon: ReactNode; alert?: boolean }) {
  return <div className={`surface flex items-center gap-4 p-4 ${alert ? "ring-2 ring-amber-200" : ""}`}><span className="grid h-11 w-11 place-items-center rounded-xl bg-basso-paper text-basso-wine">{icon}</span><div><p className="text-xs font-bold uppercase text-black/40">{label}</p><p className="text-2xl font-black">{value}</p></div></div>;
}
