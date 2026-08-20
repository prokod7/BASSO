"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, ChevronRight, CreditCard, Loader2, Smartphone, Table2, UserRound, Wifi } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { useStableDemoState } from "@/lib/stable-store";

interface RegisteredDevice {
  id: string;
  device_key: string;
  device_type: string;
  label: string;
  provider?: string | null;
  serial?: string | null;
  last_seen_at?: string | null;
}

function getSmartPosDeviceKey() {
  const storageKey = "pedidopro_waiter_smartpos_device_key";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const created = `waiter-smartpos-${crypto.randomUUID()}`;
  window.localStorage.setItem(storageKey, created);
  return created;
}

export default function GarcomPage() {
  const store = useStableDemoState((state) => state);
  const tables = store.tables;
  const ready = useMemo(() => store.orders.filter((order) => order.channel === "dine_in" && order.status === "ready"), [store.orders]);
  const [device, setDevice] = useState<RegisteredDevice | null>(null);
  const [registering, setRegistering] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const [smartPosMode, setSmartPosMode] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const stored = window.localStorage.getItem("pedidopro_waiter_smartpos_enabled") === "true";
    setSmartPosMode(query.get("mode") === "smartpos" || stored);
  }, []);

  const occupied = useMemo(() => tables.filter((table) => table.status !== "free").length, [tables]);

  async function registerSmartPos() {
    setRegistering(true); setDeviceError("");
    try {
      const deviceKey = getSmartPosDeviceKey();
      const response = await fetch("/api/devices/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceKey,
          deviceType: "waiter_smartpos",
          label: "Laranjinha Smart — Garçom",
          provider: "rede_laranjinha",
          metadata: { platform: navigator.platform || "unknown", userAgent: navigator.userAgent, screen: `${window.screen.width}x${window.screen.height}` },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível registrar o terminal.");
      setDevice(body.device as RegisteredDevice);
      setSmartPosMode(true);
      window.localStorage.setItem("pedidopro_waiter_smartpos_enabled", "true");
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : "Falha ao registrar o terminal.");
    } finally { setRegistering(false); }
  }

  return <>
    <PageHeader title="Aplicativo do garçom" icon={UserRound} description="Operação de salão no mesmo núcleo do PedidoPro, com uma interface mobile dedicada e preparação para Laranjinha Smart." actions={<Link href="/garcom" className="btn-primary"><Smartphone size={17} />Abrir versão celular</Link>} />

    <div className="mx-auto max-w-2xl space-y-4">
      <div className="surface-dark p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[.18em] text-basso-goldLight">Operação individual</p><h2 className="mt-2 font-display text-2xl font-bold">Garçom</h2><p className="mt-1 text-sm text-white/50">{occupied} mesa(s) ocupada(s) • {ready.length} pedido(s) pronto(s)</p></div><span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-300">Online</span></div></div>

      <Link href="/garcom" className="block rounded-3xl border border-basso-gold/30 bg-basso-gold/10 p-5 transition hover:-translate-y-0.5 hover:shadow-premium"><div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-basso-wine text-white"><Smartphone size={22} /></span><div className="min-w-0 flex-1"><p className="font-display text-xl font-bold">Tela Garçom Mobile</p><p className="mt-1 text-sm text-black/50">Interface própria para celular: mesas, comandas, lançamentos e pedidos prontos.</p></div><ChevronRight className="text-basso-wine" /></div></Link>

      <section className="rounded-2xl border border-black/10 bg-white p-4"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-basso-cream text-basso-wine"><Smartphone size={19} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">Modo Laranjinha Smart</p>{smartPosMode && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">terminal preparado</span>}</div><p className="mt-1 text-xs leading-5 text-black/55">A interface poderá rodar na maquininha Android. Pagamento integrado permanece bloqueado até o Itaú/Rede fornecer SDK/App2App oficial e concluir a certificação.</p>{device && <p className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} /> Dispositivo registrado no PedidoPro.</p>}{deviceError && <p className="mt-2 text-xs font-bold text-red-700">{deviceError}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={registerSmartPos} disabled={registering}>{registering ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}{device ? "Atualizar terminal" : "Registrar este terminal"}</button><button type="button" className="btn-secondary" disabled onClick={() => undefined} title="Será habilitado somente após o SDK/App2App oficial da Laranjinha Smart."><CreditCard size={16} />Pagamento SmartPOS — aguardando SDK</button></div></div></div></section>

      {ready.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="flex items-center gap-2 font-bold text-amber-900"><BellRing size={18} />{ready.length} pedido(s) pronto(s) para retirada</p><div className="mt-2 space-y-1 text-sm text-amber-800">{ready.slice(0, 5).map((order) => <p key={order.id}>Mesa {order.tableNumber || "—"} • Pedido #{order.number}</p>)}</div></div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{tables.map((table) => <Link href={`/painel/salao?mesa=${table.number}`} key={table.number} className={`rounded-2xl border p-4 ${table.status === "free" ? "border-emerald-200 bg-emerald-50" : table.status === "partial" ? "border-blue-200 bg-blue-50" : "border-black/10 bg-white"}`}><div className="flex items-center justify-between"><Table2 className="text-basso-wine" /><ChevronRight size={17} className="text-black/25" /></div><p className="mt-4 font-display text-2xl font-black">Mesa {table.number}</p><p className="mt-1 text-xs text-black/45">{table.status === "free" ? "Livre" : `${table.tabs.length} comanda(s)`}</p></Link>)}</div>
    </div>
  </>;
}
