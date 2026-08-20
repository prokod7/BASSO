"use client";

import { useMemo, useRef, useState } from "react";
import { BellRing, BellOff, ChefHat, Clock3, GlassWater, Loader2, Maximize2, Minimize2, Printer } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { statusLabel } from "@/lib/order-validation";
import { isDemoMode } from "@/lib/utils";
import { findAddon, findFlavor } from "@/lib/catalog";
import type { CartItem, Order, OrderStatus } from "@/types";

const columns: { status: OrderStatus; label: string }[] = [
  { status: "received", label: "Recebidos" },
  { status: "confirmed", label: "Confirmados" },
  { status: "preparing", label: "Em preparo" },
  { status: "ready", label: "Prontos" },
];

function elapsed(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function targetForKds(order: Order): OrderStatus | null {
  if (order.status === "confirmed") return "preparing";
  if (order.status === "preparing") return "ready";
  return null;
}

function addonLines(item: CartItem): string[] {
  const selection = item.selection;
  if (!selection || !("addons" in selection)) return [];
  const placements = (selection as { addonPlacements?: Record<string, "whole" | "halfA" | "halfB"> }).addonPlacements || {};
  const flavorA = "flavorA" in selection ? findFlavor(selection.flavorA) : undefined;
  const flavorB = "flavorB" in selection && selection.flavorB ? findFlavor(selection.flavorB) : undefined;
  return Object.entries(selection.addons)
    .filter(([, quantity]) => Number(quantity) > 0)
    .map(([id, quantity]) => {
      const addon = findAddon(id);
      const placement = placements[id] || "whole";
      const target = placement === "halfA"
        ? `METADE ${flavorA?.name || "1"}`
        : placement === "halfB"
          ? `METADE ${flavorB?.name || "2"}`
          : "PIZZA INTEIRA";
      return `${quantity}× ${addon?.name || id} • ${target}`;
    });
}

export default function KdsPage() {
  const allOrders = useDemoState((state) => state.orders.filter((order) => !["completed", "cancelled", "out_for_delivery"].includes(order.status)));
  const [sector, setSector] = useState<"kitchen" | "bar">("kitchen");
  const [sound, setSound] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const orders = useMemo(
    () => allOrders
      .map((order) => ({
        ...order,
        items: order.items.filter((item) => sector === "bar" ? item.kind === "product" : item.kind !== "product"),
      }))
      .filter((order) => order.items.length > 0),
    [allOrders, sector],
  );

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
      oscillator.stop(context.currentTime + 0.08);
    } catch {
      // Som é auxiliar. Falha de áudio nunca pode bloquear a operação.
    }
  }

  async function toggleFullscreen() {
    try {
      if (typeof document === "undefined") return;
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
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
      setMessage(`Pedido #${order.number} enviado para a fila de ${sector === "bar" ? "bar" : "cozinha"}.`);
    } catch (error) {
      setMessage(formatApiError(error, "Falha ao enviar impressão."));
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
          body: JSON.stringify({
            status: next,
            reason: `Avanço pelo KDS ${sector === "bar" ? "Bar" : "Cozinha"}`,
          }),
        });
        requestOperationalRefresh();
      }
      beep();
      setMessage(`Pedido #${order.number}: ${statusLabel[next]}.`);
    } catch (error) {
      setMessage(formatApiError(error, "Não foi possível atualizar a produção."));
    } finally {
      setWorking(null);
    }
  }

  return <>
    <PageHeader
      title="Cozinha e produção"
      icon={ChefHat}
      description="Fila por setor com atualização persistida no servidor, cronômetros, observações, retiradas, adicionais e impressão auditada."
      actions={<>
        <button className="btn-secondary" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}Modo monitor</button>
        <button className="btn-secondary" onClick={() => setSound((value) => !value)}>{sound ? <BellRing size={16} /> : <BellOff size={16} />}Som {sound ? "ativo" : "desativado"}</button>
        <div className="flex rounded-xl border bg-white p-1">
          <button className={`btn-ghost min-h-9 ${sector === "kitchen" ? "bg-basso-wine text-white hover:text-white" : ""}`} onClick={() => setSector("kitchen")}><ChefHat size={16} />Cozinha</button>
          <button className={`btn-ghost min-h-9 ${sector === "bar" ? "bg-basso-wine text-white hover:text-white" : ""}`} onClick={() => setSector("bar")}><GlassWater size={16} />Bar</button>
        </div>
      </>}
    />
    {message && <p className="mb-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-800">{message}</p>}
    <div className="grid gap-4 xl:grid-cols-4">
      {columns.map((column) => <section key={column.status} className="min-h-[520px] rounded-3xl border border-black/5 bg-black/[.025] p-3">
        <div className="mb-3 flex items-center justify-between px-2"><h2 className="font-display text-xl font-bold">{column.label}</h2><span className="rounded-full bg-white px-2 py-1 text-xs font-bold">{orders.filter((order) => order.status === column.status).length}</span></div>
        <div className="space-y-3">
          {orders.filter((order) => order.status === column.status).map((order) => {
            const minutes = elapsed(order.createdAt);
            const target = targetForKds(order);
            const busy = working === `status_${order.id}`;
            return <article key={order.id} className={`surface overflow-hidden ${minutes >= 45 ? "border-amber-300" : ""}`}>
              <div className="flex items-center justify-between bg-basso-black px-4 py-3 text-white"><strong>#{order.number}</strong><span className={`flex items-center gap-1 text-xs ${minutes >= 45 ? "font-black text-amber-300" : "text-white/55"}`}><Clock3 size={13} />{minutes} min</span></div>
              <div className="p-4">
                <p className="font-bold">{order.customerName}</p>
                {order.notes && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-900">{order.notes}</p>}
                <div className="mt-3 space-y-2">
                  {order.items.map((item) => <div key={item.id} className="rounded-xl bg-basso-paper p-3">
                    <p className="text-sm"><strong>{item.quantity}×</strong> {item.name}</p>
                    {item.selection && "removedA" in item.selection && item.selection.removedA.length > 0 && <p className="mt-1 text-xs font-bold text-red-700">SEM: {item.selection.removedA.join(", ")}</p>}
                    {addonLines(item).map((line) => <p key={line} className="mt-1 text-xs font-black text-emerald-800">+ {line}</p>)}
                    {item.selection && "notes" in item.selection && item.selection.notes && <p className="mt-1 text-xs font-bold text-amber-800">OBS: {item.selection.notes}</p>}
                  </div>)}
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="btn-secondary min-h-9 flex-1 text-xs" disabled={working === `print_${order.id}` || busy} onClick={() => print(order)}>{working === `print_${order.id}` ? <Loader2 className="animate-spin" size={14} /> : <Printer size={14} />}Imprimir</button>
                  {target
                    ? <button className="btn-primary min-h-9 flex-1 text-xs" disabled={busy || working === `print_${order.id}`} onClick={() => advance(order)}>{busy ? <Loader2 className="animate-spin" size={14} /> : null}{statusLabel[target]}</button>
                    : order.status === "received"
                      ? <span className="flex flex-1 items-center justify-center rounded-xl bg-amber-50 px-2 text-center text-[11px] font-bold text-amber-800">Aguardando confirmação</span>
                      : <span className="flex flex-1 items-center justify-center rounded-xl bg-emerald-50 px-2 text-center text-[11px] font-bold text-emerald-800">Aguardando expedição</span>}
                </div>
              </div>
            </article>;
          })}
        </div>
      </section>)}
    </div>
    <div className="mt-5 flex items-center gap-2 rounded-2xl border border-basso-gold/30 bg-basso-gold/10 p-4 text-sm"><BellRing className="text-basso-wine" /><span>Em produção, uma mudança só aparece como concluída depois que o servidor confirma. A impressão só confirma a fila; o resultado físico depende do Print Bridge local.</span></div>
  </>;
}
