"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, BellOff, ChefHat, Clock3, GlassWater, Loader2, Maximize2, Minimize2, Printer, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { demoActions } from "@/lib/demo-store";
import { useStableDemoState } from "@/lib/stable-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { statusLabel } from "@/lib/order-validation";
import { isDemoMode } from "@/lib/utils";
import { compactItemName, itemDetails } from "@/lib/item-presentation";
import type { CartItem, Order, OrderStatus } from "@/types";

type OperationalCartItem = CartItem & { sector?: "kitchen" | "bar" | "counter"; productionStatus?: string };

const columns: { status: OrderStatus; label: string }[] = [
  { status: "received", label: "Recebidos" },
  { status: "confirmed", label: "Confirmados" },
  { status: "preparing", label: "Em preparo" },
  { status: "ready", label: "Prontos" },
];

function elapsed(iso?: string) {
  if (!iso) return 0;
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
}

function targetForKds(order: Order): OrderStatus | null {
  if (order.status === "confirmed") return "preparing";
  if (order.status === "preparing") return "ready";
  return null;
}

function channelBadge(order: Order) {
  if (order.channel === "ifood") return { label: `iFood${order.externalId ? ` • ${order.externalId}` : ""}`, className: "bg-red-600 text-white" };
  if (order.channel === "99food") return { label: `99Food${order.externalId ? ` • ${order.externalId}` : ""}`, className: "bg-yellow-300 text-black" };
  if (order.channel === "dine_in" || order.channel === "table_qr") return { label: order.tableNumber ? `Mesa ${order.tableNumber}` : "Salão", className: "bg-blue-100 text-blue-900" };
  if (order.channel === "own_delivery") return { label: "Delivery", className: "bg-emerald-100 text-emerald-900" };
  if (order.channel === "pickup") return { label: "Retirada", className: "bg-violet-100 text-violet-900" };
  return { label: "Balcão", className: "bg-stone-100 text-stone-800" };
}

function belongsToSector(item: OperationalCartItem, sector: "kitchen" | "bar") {
  if (item.sector) return item.sector === sector;
  return sector === "bar" ? item.kind === "product" : item.kind !== "product";
}

export default function KdsPage() {
  const store = useStableDemoState((state) => state);
  const [sector, setSector] = useState<"kitchen" | "bar">("kitchen");
  const [sound, setSound] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousOrdersRef = useRef<Set<string> | null>(null);

  const allOrders = useMemo(
    () => store.orders.filter((order) => !["completed", "cancelled", "out_for_delivery"].includes(order.status)),
    [store.orders],
  );

  const orders = useMemo(() => {
    const term = query.trim().toLowerCase();
    return allOrders
      .map((order) => ({
        ...order,
        items: (Array.isArray(order.items) ? order.items : []).filter((item) => belongsToSector(item as OperationalCartItem, sector)),
      }))
      .filter((order) => order.items.length > 0)
      .filter((order) => !term || `${order.number} ${order.customerName || ""} ${order.externalId || ""} ${order.tableNumber || ""}`.toLowerCase().includes(term));
  }, [allOrders, query, sector]);

  function beep() {
    if (!sound || typeof window === "undefined") return;
    try {
      const AudioContextCtor = window.AudioContext;
      if (!AudioContextCtor) return;
      const context = audioContextRef.current || new AudioContextCtor();
      audioContextRef.current = context;
      if (context.state === "suspended") void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 620;
      gain.gain.value = 0.04;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.1);
    } catch {
      // Som é auxiliar e nunca bloqueia a operação.
    }
  }

  useEffect(() => {
    const ids = new Set(orders.map((order) => order.id));
    const previous = previousOrdersRef.current;
    if (previous && orders.some((order) => !previous.has(order.id) && ["received", "confirmed"].includes(order.status))) beep();
    previousOrdersRef.current = ids;
  }, [orders]);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    sync();
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setMessage("O navegador não permitiu ativar o modo monitor em tela cheia.");
    }
  }

  async function print(order: Order) {
    setWorking(`print_${order.id}`);
    setMessage("");
    try {
      if (!isDemoMode()) {
        await apiJson(`/api/orders/${order.id}/print`, {
          method: "POST",
          body: JSON.stringify({ sector, reason: `Impressão manual solicitada no KDS ${sector}` }),
        });
      }
      setMessage(`Comanda ${sector === "bar" ? "do bar" : "da cozinha"} do pedido #${order.number} aberta na impressão padrão do navegador.`);
    } catch (error) {
      setMessage(formatApiError(error, "Falha ao abrir a impressão."));
    } finally {
      setWorking(null);
    }
  }

  async function advance(order: Order) {
    const next = targetForKds(order);
    if (!next) return;
    setWorking(`status_${order.id}`);
    setMessage("");
    try {
      if (isDemoMode()) {
        demoActions.updateOrderStatus(order.id, next, sector === "bar" ? "Bar" : "Cozinha");
      } else {
        await apiJson(`/api/orders/${order.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: next, expectedVersion: order.version, reason: `Avanço pelo KDS ${sector === "bar" ? "Bar" : "Cozinha"}` }),
        });
        requestOperationalRefresh();
      }
      setMessage(`Pedido #${order.number}: ${statusLabel[next]}.`);
    } catch (error) {
      setMessage(formatApiError(error, "Não foi possível atualizar a produção."));
      requestOperationalRefresh();
    } finally {
      setWorking(null);
    }
  }

  return <>
    <PageHeader title="Cozinha e produção" icon={ChefHat} description="KDS por setor, com Realtime, cronômetros, meio a meio, adicionais por metade e comanda térmica pelo navegador." actions={<><button className="btn-secondary" onClick={() => requestOperationalRefresh()}><RefreshCw size={16} />Atualizar</button><button className="btn-secondary" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}Modo monitor</button><button className="btn-secondary" onClick={() => { setSound((value) => !value); if (!sound) beep(); }}>{sound ? <BellRing size={16} /> : <BellOff size={16} />}Som {sound ? "ativo" : "desativado"}</button></>} />

    <div className="mb-4 flex flex-col gap-3 rounded-2xl border bg-white p-3 sm:flex-row sm:items-center"><div className="flex rounded-xl border bg-white p-1"><button className={`btn-ghost min-h-9 flex-1 ${sector === "kitchen" ? "bg-basso-wine text-white hover:text-white" : ""}`} onClick={() => setSector("kitchen")}><ChefHat size={16} />Cozinha</button><button className={`btn-ghost min-h-9 flex-1 ${sector === "bar" ? "bg-basso-wine text-white hover:text-white" : ""}`} onClick={() => setSector("bar")}><GlassWater size={16} />Bar</button></div><input className="input sm:ml-auto sm:max-w-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pedido, mesa ou código" /></div>

    {message && <p className="mb-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-800">{message}</p>}

    <div className="grid gap-4 xl:grid-cols-4">
      {columns.map((column) => {
        const columnOrders = orders.filter((order) => order.status === column.status);
        return <section key={column.status} className="min-h-[420px] rounded-3xl border border-black/5 bg-black/[.025] p-3 xl:min-h-[560px]">
          <div className="mb-3 flex items-center justify-between px-2"><h2 className="font-display text-xl font-bold">{column.label}</h2><span className="rounded-full bg-white px-2 py-1 text-xs font-bold">{columnOrders.length}</span></div>
          <div className="space-y-3">
            {columnOrders.map((order) => {
              const minutes = elapsed(order.updatedAt || order.createdAt);
              const target = targetForKds(order);
              const busy = working === `status_${order.id}`;
              const badge = channelBadge(order);
              return <article key={order.id} className={`surface overflow-hidden ${minutes >= 45 ? "border-red-300 ring-1 ring-red-200" : minutes >= 30 ? "border-amber-300" : ""}`}>
                <div className="flex items-center justify-between bg-basso-black px-4 py-3 text-white"><div className="flex min-w-0 items-center gap-2"><strong>#{order.number}</strong><span className={`max-w-40 truncate rounded-full px-2 py-1 text-[9px] font-black ${badge.className}`}>{badge.label}</span></div><span className={`flex items-center gap-1 text-xs ${minutes >= 45 ? "font-black text-red-300" : minutes >= 30 ? "font-black text-amber-300" : "text-white/55"}`}><Clock3 size={13} />{minutes} min</span></div>
                <div className="p-4"><p className="font-bold">{order.customerName || "Cliente"}</p>{order.notes && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-900">OBS PEDIDO: {order.notes}</p>}<div className="mt-3 space-y-2">{(order.items || []).map((item) => <div key={item.id} className="rounded-xl bg-basso-paper p-3"><p className="text-sm"><strong>{item.quantity}×</strong> {compactItemName(item) || "Item"}</p>{itemDetails(item).map((line, i) => <p key={i} className={`mt-1 whitespace-pre-wrap text-xs ${line.emphasis ? "font-black text-basso-wine" : "text-black/60"}`}>{line.text}</p>)}</div>)}</div><div className="mt-3 flex gap-2"><button className="btn-secondary min-h-9 flex-1 text-xs" disabled={working === `print_${order.id}` || busy} onClick={() => print(order)}>{working === `print_${order.id}` ? <Loader2 className="animate-spin" size={14} /> : <Printer size={14} />}Imprimir</button>{target ? <button className="btn-primary min-h-9 flex-1 text-xs" disabled={busy || working === `print_${order.id}`} onClick={() => advance(order)}>{busy ? <Loader2 className="animate-spin" size={14} /> : null}{statusLabel[target]}</button> : order.status === "received" ? <span className="flex flex-1 items-center justify-center rounded-xl bg-amber-50 px-2 text-center text-[11px] font-bold text-amber-800">Aguardando confirmação</span> : <span className="flex flex-1 items-center justify-center rounded-xl bg-emerald-50 px-2 text-center text-[11px] font-bold text-emerald-800">Aguardando expedição</span>}</div></div>
              </article>;
            })}
            {!columnOrders.length && <div className="rounded-2xl border border-dashed border-black/10 bg-white/60 p-6 text-center text-xs text-black/40">Nenhum pedido nesta etapa.</div>}
          </div>
        </section>;
      })}
    </div>
    <div className="mt-5 flex items-center gap-2 rounded-2xl border border-basso-gold/30 bg-basso-gold/10 p-4 text-sm"><BellRing className="shrink-0 text-basso-wine" /><span>O botão Imprimir abre a comanda térmica da cozinha no diálogo padrão do navegador. Impressão automática pelo Print Bridge é opcional.</span></div>
  </>;
}
