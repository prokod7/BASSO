"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, ChevronRight, CreditCard, Loader2, Smartphone, Table2, UserRound, Wifi } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { useDemoState } from "@/lib/demo-store";

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
  const tables = useDemoState((state) => state.tables);
  const ready = useDemoState((state) => state.orders.filter((order) => order.channel === "dine_in" && order.status === "ready"));
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
    setRegistering(true);
    setDeviceError("");
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
          metadata: {
            platform: navigator.platform || "unknown",
            userAgent: navigator.userAgent,
            screen: `${window.screen.width}x${window.screen.height}`,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível registrar o terminal.");
      setDevice(body.device as RegisteredDevice);
      setSmartPosMode(true);
      window.localStorage.setItem("pedidopro_waiter_smartpos_enabled", "true");
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : "Falha ao registrar o terminal.");
    } finally {
      setRegistering(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Aplicativo do garçom"
        icon={UserRound}
        description="Mesas, comandas e lançamentos no mesmo núcleo do PedidoPro; preparado para a Laranjinha Smart sem assumir um SDK de pagamento antes da homologação."
      />

      <div className="mx-auto max-w-xl space-y-4">
        <div className="surface-dark p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[.18em] text-basso-goldLight">Login individual</p>
              <h2 className="mt-2 font-display text-2xl font-bold">Operação do garçom</h2>
              <p className="mt-1 text-sm text-white/50">{occupied} mesa(s) ocupada(s) • ações registradas por usuário</p>
            </div>
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-300">Online</span>
          </div>
        </div>

        <section className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-basso-cream text-basso-wine"><Smartphone size={19} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">Modo Laranjinha Smart</p>
                {smartPosMode && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">terminal preparado</span>}
              </div>
              <p className="mt-1 text-xs leading-5 text-black/55">A mesma tela poderá rodar na maquininha Android. Pagamento integrado permanece bloqueado até o Itaú/Rede fornecer SDK/App2App oficial e concluir a certificação.</p>
              {device && <p className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} /> Dispositivo registrado no PedidoPro.</p>}
              {deviceError && <p className="mt-2 text-xs font-bold text-red-700">{deviceError}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={registerSmartPos} disabled={registering}>
                  {registering ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
                  {device ? "Atualizar terminal" : "Registrar este terminal"}
                </button>
                <button type="button" className="btn-secondary" disabled onClick={() => undefined} title="Será habilitado somente após o SDK/App2App oficial da Laranjinha Smart.">
                  <CreditCard size={16} /> Pagamento SmartPOS — aguardando SDK
                </button>
              </div>
            </div>
          </div>
        </section>

        {ready.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 font-bold text-amber-900"><BellRing size={18} />Pedido pronto para retirada</p>
            <p className="mt-1 text-sm text-amber-800">Mesa {ready[0].tableNumber || "—"} • Pedido #{ready[0].number}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {tables.map((table) => (
            <Link
              href={`/painel/salao?mesa=${table.number}`}
              key={table.number}
              className={`rounded-2xl border p-4 ${table.status === "free" ? "border-emerald-200 bg-emerald-50" : "border-black/10 bg-white"}`}
            >
              <div className="flex items-center justify-between">
                <Table2 className="text-basso-wine" />
                <ChevronRight size={17} className="text-black/25" />
              </div>
              <p className="mt-4 font-display text-2xl font-black">Mesa {table.number}</p>
              <p className="mt-1 text-xs text-black/45">{table.status === "free" ? "Livre" : `${table.tabs.length} comanda(s)`}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
