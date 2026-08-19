"use client";

import { useEffect, useRef, useState } from "react";
import { Bike, CheckCircle2, Crosshair, Loader2, MapPin, Navigation, Phone, Power, Radio, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { currency, isDemoMode, shortDateTime } from "@/lib/utils";

const LOCATION_MIN_INTERVAL_MS = 8_000;

export default function DriverPage() {
  const drivers = useDemoState((state) => state.drivers);
  const [driverId, setDriverId] = useState(drivers[0]?.id || "");
  const driver = drivers.find((item) => item.id === driverId);
  const order = useDemoState((state) => state.orders.find((item) => item.id === driver?.activeOrderId));
  const [gpsActive, setGpsActive] = useState(false);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);
  const sendingPosition = useRef(false);

  useEffect(() => {
    if (!driverId && drivers[0]?.id) setDriverId(drivers[0].id);
  }, [driverId, drivers]);

  useEffect(() => () => {
    if (watchId.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
  }, []);

  function stopGps() {
    if (watchId.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setGpsActive(false);
  }

  async function sendPosition(position: GeolocationPosition) {
    if (!driverId || sendingPosition.current) return;
    const now = Date.now();
    if (now - lastSentAt.current < LOCATION_MIN_INTERVAL_MS) return;
    lastSentAt.current = now;
    sendingPosition.current = true;
    try {
      if (isDemoMode()) {
        demoActions.updateDriverLocation(driverId, position.coords.latitude, position.coords.longitude, {
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
        });
      } else {
        await apiJson(`/api/drivers/${driverId}/location`, {
          method: "POST",
          body: JSON.stringify({
            orderId: driver?.activeOrderId || null,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            heading: position.coords.heading,
            capturedAt: new Date(position.timestamp).toISOString(),
          }),
        });
      }
      setGpsActive(true);
    } catch (error) {
      setMessage(formatApiError(error, "Não foi possível enviar sua posição. Confira internet e sessão."));
    } finally {
      sendingPosition.current = false;
    }
  }

  function activateGps() {
    if (!driverId || !driver?.shiftActive) { setMessage("Inicie o turno antes de ativar o rastreamento interno."); return; }
    if (typeof navigator === "undefined" || !navigator.geolocation) { setMessage("Este aparelho não disponibiliza localização pelo navegador."); return; }
    if (watchId.current !== null) return;
    setMessage("");
    watchId.current = navigator.geolocation.watchPosition(
      (position) => { void sendPosition(position); },
      (error) => {
        setGpsActive(false);
        setMessage(error.code === error.PERMISSION_DENIED ? "Permita o acesso à localização para iniciar o rastreamento." : "Não foi possível atualizar a localização. Confira GPS e internet.");
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    setGpsActive(true);
  }

  async function startShift() {
    if (!driverId) return;
    setWorking("start"); setMessage("");
    try {
      if (isDemoMode()) demoActions.startDriverShift(driverId);
      else {
        await apiJson("/api/drivers/shifts/start", { method: "POST", body: JSON.stringify({ driverId }) });
        requestOperationalRefresh();
      }
      setMessage("Turno iniciado. Agora ative o GPS para compartilhar a posição com a pizzaria.");
    } catch (error) { setMessage(formatApiError(error, "Falha ao iniciar turno.")); }
    finally { setWorking(""); }
  }

  async function endShift() {
    if (!driverId) return;
    if (driver?.activeOrderId) { setMessage("Finalize ou transfira a entrega ativa antes de encerrar o turno."); return; }
    setWorking("end"); setMessage("");
    try {
      if (isDemoMode()) demoActions.endDriverShift(driverId);
      else {
        await apiJson("/api/drivers/shifts/end", { method: "POST", body: JSON.stringify({ driverId }) });
        requestOperationalRefresh();
      }
      stopGps();
      setMessage("Turno encerrado. O rastreamento interno foi interrompido.");
    } catch (error) { setMessage(formatApiError(error, "Falha ao encerrar turno.")); }
    finally { setWorking(""); }
  }

  async function beginDelivery() {
    if (!order) return;
    if (!driver?.shiftActive) { setMessage("Inicie o turno do motoboy antes de sair para entrega."); return; }
    if (!gpsActive) activateGps();
    if (order.status !== "ready") { setMessage("A entrega já está iniciada ou o pedido ainda não está pronto."); return; }
    setWorking("delivery"); setMessage("");
    try {
      if (isDemoMode()) demoActions.updateOrderStatus(order.id, "out_for_delivery", "Motoboy");
      else {
        await apiJson(`/api/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "out_for_delivery", reason: "Saída para entrega pelo PWA do motoboy" }) });
        requestOperationalRefresh();
      }
      setMessage("Entrega iniciada. O cliente pode acompanhar somente enquanto este pedido estiver em rota.");
    } catch (error) { setMessage(formatApiError(error, "Falha ao iniciar entrega.")); }
    finally { setWorking(""); }
  }

  async function completeDelivery() {
    if (!order) return;
    setWorking("complete"); setMessage("");
    try {
      if (isDemoMode()) demoActions.completeDelivery(order.id, driverId);
      else {
        await apiJson(`/api/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "completed", reason: "Entrega concluída pelo PWA do motoboy" }) });
        requestOperationalRefresh();
      }
      setMessage("Entrega concluída. O acesso do cliente ao rastreio foi encerrado; o rastreamento interno continua enquanto seu turno e GPS estiverem ativos.");
    } catch (error) {
      setMessage(formatApiError(error, "Não foi possível concluir a entrega. Se houver pagamento pendente, confirme o recebimento antes de finalizar."));
    } finally { setWorking(""); }
  }

  return <>
    <PageHeader title="PWA do motoboy" icon={Bike} description="O cliente acompanha somente a entrega dele. A pizzaria continua vendo o motoboy durante o turno ativo, inclusive após a conclusão da entrega." />
    <div className="mx-auto max-w-lg space-y-5">
      <div className="surface-dark p-5">
        <label className="text-xs uppercase tracking-[.15em] text-basso-goldLight">Motoboy conectado</label>
        <select className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 font-bold outline-none" value={driverId} onChange={(event) => { stopGps(); setDriverId(event.target.value); }}>
          {drivers.map((item) => <option key={item.id} className="text-black" value={item.id}>{item.name}</option>)}
        </select>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className={driver?.shiftActive ? "btn-secondary border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "btn-primary"} disabled={!!working || driver?.shiftActive} onClick={startShift}>{working === "start" ? <Loader2 className="animate-spin" size={18} /> : <Power size={18} />} {driver?.shiftActive ? "Turno ativo" : "Iniciar turno"}</button>
          <button className="btn-secondary" disabled={!!working || !driver?.shiftActive} onClick={endShift}>{working === "end" ? <Loader2 className="animate-spin" size={18} /> : <Power size={18} />}Encerrar turno</button>
        </div>
      </div>

      <div className={`rounded-2xl border p-4 ${gpsActive ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 font-bold"><Radio size={18} />Rastreamento interno</p><p className="mt-1 text-xs opacity-70">{gpsActive ? "GPS ativo • posição compartilhada com a La Forneria Basso" : "GPS parado"}</p></div><button className="btn-secondary" disabled={!driver?.shiftActive} onClick={gpsActive ? stopGps : activateGps}>{gpsActive ? "Pausar GPS" : "Ativar GPS"}</button></div>
        {driver?.lastLocationAt && <p className="mt-3 text-xs opacity-60">Última posição confirmada: {shortDateTime(driver.lastLocationAt)}</p>}
      </div>

      {message && <p className="rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</p>}

      {order ? <article className="surface overflow-hidden">
        <div className="bg-basso-wine p-5 text-white"><p className="text-xs font-bold uppercase tracking-wide text-white/60">Entrega atribuída</p><h2 className="mt-1 font-display text-3xl font-bold">Pedido #{order.number}</h2><p className="mt-2 flex items-center gap-2 text-xs text-white/70"><ShieldCheck size={15} />O link do cliente será encerrado ao concluir a entrega.</p></div>
        <div className="space-y-4 p-5">
          <div><p className="font-display text-xl font-bold">{order.customerName}</p>{order.customerPhone && <a href={`tel:${order.customerPhone}`} className="mt-2 flex items-center gap-2 text-sm font-semibold text-basso-wine"><Phone size={17} />{order.customerPhone}</a>}</div>
          <div className="rounded-2xl bg-basso-paper p-4"><p className="flex items-start gap-2 text-sm"><MapPin size={18} className="mt-0.5 shrink-0 text-basso-wine" />{order.address ? `${order.address.street}, ${order.address.number}, ${order.address.district}. ${order.address.complement || ""}` : "Endereço indisponível"}</p><button className="btn-ghost mt-2 px-0" onClick={() => { const text = order.address ? `${order.address.street}, ${order.address.number}, ${order.address.district}, ${order.address.city} - ${order.address.state}` : "La Forneria Basso"; window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer"); }}><Navigation size={16} />Abrir navegação externa</button></div>
          <div className="grid grid-cols-2 gap-3"><Info label="Total" value={currency(order.total)} /><Info label="Pagamento" value={order.paymentStatus === "paid" ? "Pago" : "Pendente"} /></div>
          <button className="btn-primary w-full py-4 text-base" onClick={beginDelivery} disabled={!!working || !driver?.shiftActive || order.status !== "ready"}>{working === "delivery" ? <Loader2 className="animate-spin" size={20} /> : <Crosshair size={20} />}{order.status === "ready" ? "Iniciar entrega" : "Entrega em andamento"}</button>
          <button className="btn-secondary w-full py-4 text-base" onClick={completeDelivery} disabled={!!working || order.status !== "out_for_delivery"}>{working === "complete" ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}Pedido entregue</button>
        </div>
      </article> : <div className="surface p-10 text-center"><Bike className="mx-auto text-black/20" size={48} /><h2 className="mt-4 font-display text-2xl font-bold">Sem entrega atribuída</h2><p className="mt-2 text-sm text-black/50">Com o turno e o GPS ativos, a pizzaria continua vendo sua localização enquanto você aguarda a próxima entrega.</p></div>}
    </div>
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border p-3"><p className="text-[10px] font-bold uppercase text-black/40">{label}</p><p className="mt-1 font-bold">{value}</p></div>;
}
