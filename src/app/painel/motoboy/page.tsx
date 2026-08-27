"use client";

import { useEffect, useRef, useState } from "react";
import { Bike, CheckCircle2, Crosshair, KeyRound, Loader2, MapPin, Navigation, Phone, Power, QrCode, Radio, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { currency, isDemoMode, shortDateTime } from "@/lib/utils";

const LOCATION_MIN_INTERVAL_MS = 8_000;

export default function DriverPage() {
  const drivers = useDemoState(state => state.drivers);
  const [driverId, setDriverId] = useState(drivers[0]?.id || "");
  const driver = drivers.find(item => item.id === driverId);
  const allOrders = useDemoState(state => state.orders);
  const order = allOrders.find(item => item.id === driver?.activeOrderId);
  const availableOrders = allOrders.filter(item => item.channel === "own_delivery" && item.status === "ready" && (!item.driverId || item.driverId === driverId));

  const [gpsActive, setGpsActive] = useState(false);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [pickupCode, setPickupCode] = useState("");
  const [deliveryCode, setDeliveryCode] = useState("");
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [scannedOrderId, setScannedOrderId] = useState("");
  const [scannedToken, setScannedToken] = useState("");

  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);
  const sendingPosition = useRef(false);

  useEffect(() => {
    if (!driverId && drivers[0]?.id) setDriverId(drivers[0].id);
  }, [driverId, drivers]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("pickupToken") || "";
    const targetOrder = params.get("order") || "";
    if (token && targetOrder) {
      setScannedToken(token);
      setScannedOrderId(targetOrder);
      setMessage("QR Code reconhecido. Confirme o motoboy e valide a retirada.");
    }
  }, []);

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
      position => { void sendPosition(position); },
      error => {
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
      setMessage("Turno iniciado. Ative o GPS antes de sair para entrega.");
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

  async function chooseDelivery(orderId: string) {
    if (!driverId || !driver?.shiftActive) { setMessage("Inicie o turno antes de escolher uma entrega."); return; }
    if (driver.activeOrderId && driver.activeOrderId !== orderId) { setMessage("Finalize a entrega atual antes de escolher outra."); return; }
    setWorking(`claim:${orderId}`); setMessage("");
    try {
      if (isDemoMode()) demoActions.assignDriver(orderId, driverId);
      else {
        await apiJson("/api/delivery/assign", { method: "POST", body: JSON.stringify({ orderId, driverId }) });
        requestOperationalRefresh();
      }
      setMessage("Pedido assumido. Agora valide a retirada pelo QR ou código da comanda.");
    } catch (error) { setMessage(formatApiError(error, "Não foi possível assumir esse pedido.")); }
    finally { setWorking(""); }
  }

  async function validatePickup(mode: "qr" | "code") {
    if (!driverId || !driver?.shiftActive) { setMessage("Inicie o turno antes de validar a retirada."); return; }
    const targetOrderId = mode === "qr" ? scannedOrderId : order?.id;
    if (!targetOrderId) { setMessage("Escolha uma entrega antes de informar o código."); return; }
    if (mode === "code" && pickupCode.replace(/\D/g, "").length !== 6) { setMessage("Digite os 6 dígitos do código de retirada."); return; }
    if (driver.activeOrderId && driver.activeOrderId !== targetOrderId) { setMessage("Existe outra entrega ativa neste motoboy."); return; }

    setWorking("pickup"); setMessage("");
    try {
      if (!driver.activeOrderId && !isDemoMode()) {
        await apiJson("/api/delivery/assign", { method: "POST", body: JSON.stringify({ orderId: targetOrderId, driverId }) });
      } else if (!driver.activeOrderId && isDemoMode()) {
        demoActions.assignDriver(targetOrderId, driverId);
      }

      if (isDemoMode()) {
        demoActions.updateOrderStatus(targetOrderId, "out_for_delivery", "Retirada validada");
      } else {
        await apiJson(`/api/delivery/verification/${encodeURIComponent(targetOrderId)}/pickup`, {
          method: "POST",
          body: JSON.stringify({
            driverId,
            code: mode === "code" ? pickupCode : undefined,
            token: mode === "qr" ? scannedToken : undefined,
          }),
        });
        requestOperationalRefresh();
      }
      setPickupCode("");
      setScannedToken("");
      setScannedOrderId("");
      window.history.replaceState({}, "", window.location.pathname);
      if (!gpsActive) activateGps();
      setMessage("Retirada validada. Pedido em rota e rastreamento liberado.");
    } catch (error) {
      setMessage(formatApiError(error, "Não foi possível validar a retirada."));
    } finally { setWorking(""); }
  }

  async function completeDelivery() {
    if (!order || order.status !== "out_for_delivery") return;
    if (deliveryCode.replace(/\D/g, "").length !== 6) { setMessage("Digite o código de 6 dígitos informado pelo cliente."); return; }
    setWorking("complete"); setMessage("");
    try {
      if (isDemoMode()) {
        demoActions.completeDelivery(order.id, driverId);
      } else {
        await apiJson(`/api/delivery/verification/${encodeURIComponent(order.id)}/complete`, {
          method: "POST",
          body: JSON.stringify({ driverId, code: deliveryCode, paymentReceived }),
        });
        requestOperationalRefresh();
      }
      setDeliveryCode("");
      setPaymentReceived(false);
      setMessage("Entrega confirmada pelo código do cliente. Rastreamento público encerrado.");
    } catch (error) {
      setMessage(formatApiError(error, "Não foi possível concluir a entrega."));
    } finally { setWorking(""); }
  }

  return <>
    <PageHeader title="PWA do motoboy" icon={Bike} description="Retirada validada por QR/código, rastreio durante a rota e confirmação final com o código privado do cliente." />
    <div className="mx-auto max-w-lg space-y-5">
      <div className="surface-dark p-5">
        <label className="text-xs uppercase tracking-[.15em] text-basso-goldLight">Motoboy conectado</label>
        <select className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 font-bold outline-none" value={driverId} onChange={event => { stopGps(); setDriverId(event.target.value); }}>
          {drivers.map(item => <option key={item.id} className="text-black" value={item.id}>{item.name}</option>)}
        </select>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className={driver?.shiftActive ? "btn-secondary border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "btn-primary"} disabled={Boolean(working) || driver?.shiftActive} onClick={startShift}>{working === "start" ? <Loader2 className="animate-spin" size={18} /> : <Power size={18} />} {driver?.shiftActive ? "Turno ativo" : "Iniciar turno"}</button>
          <button className="btn-secondary" disabled={Boolean(working) || !driver?.shiftActive} onClick={endShift}>{working === "end" ? <Loader2 className="animate-spin" size={18} /> : <Power size={18} />}Encerrar turno</button>
        </div>
      </div>

      <div className={`rounded-2xl border p-4 ${gpsActive ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 font-bold"><Radio size={18} />Rastreamento</p><p className="mt-1 text-xs opacity-70">{gpsActive ? "GPS ativo • posição compartilhada com a pizzaria" : "GPS parado"}</p></div><button className="btn-secondary" disabled={!driver?.shiftActive} onClick={gpsActive ? stopGps : activateGps}>{gpsActive ? "Pausar GPS" : "Ativar GPS"}</button></div>
        {driver?.lastLocationAt && <p className="mt-3 text-xs opacity-60">Última posição: {shortDateTime(driver.lastLocationAt)}</p>}
      </div>

      {scannedToken && scannedOrderId && <section className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-5">
        <div className="flex items-start gap-3"><QrCode className="mt-0.5 shrink-0 text-emerald-700" /><div><p className="font-display text-xl font-bold text-emerald-900">QR Code reconhecido</p><p className="mt-1 text-sm text-emerald-800">O pedido foi identificado pela câmera do celular. Confirme para assumir e retirar.</p></div></div>
        <button className="btn-primary mt-4 w-full" disabled={Boolean(working) || !driver?.shiftActive} onClick={() => void validatePickup("qr")}>{working === "pickup" ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}Validar retirada pelo QR</button>
      </section>}

      {message && <p className="rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</p>}

      {order ? <article className="surface overflow-hidden">
        <div className="bg-basso-wine p-5 text-white"><p className="text-xs font-bold uppercase tracking-wide text-white/60">Entrega atribuída</p><h2 className="mt-1 font-display text-3xl font-bold">Pedido #{order.number}</h2><p className="mt-2 flex items-center gap-2 text-xs text-white/70"><ShieldCheck size={15} />{order.status === "ready" ? "Aguardando validação de retirada" : "Entrega em rota"}</p></div>
        <div className="space-y-4 p-5">
          <div><p className="font-display text-xl font-bold">{order.customerName}</p>{order.customerPhone && <a href={`tel:${order.customerPhone}`} className="mt-2 flex items-center gap-2 text-sm font-semibold text-basso-wine"><Phone size={17} />{order.customerPhone}</a>}</div>
          <div className="rounded-2xl bg-basso-paper p-4"><p className="flex items-start gap-2 text-sm"><MapPin size={18} className="mt-0.5 shrink-0 text-basso-wine" />{order.address ? `${order.address.street}, ${order.address.number}, ${order.address.district}. ${order.address.complement || ""}` : "Endereço indisponível"}</p><button className="btn-ghost mt-2 px-0" onClick={() => { const text = order.address ? `${order.address.street}, ${order.address.number}, ${order.address.district}, ${order.address.city} - ${order.address.state}` : "La Forneria Basso"; window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer"); }}><Navigation size={16} />Abrir rota</button></div>
          <div className="grid grid-cols-2 gap-3"><Info label="Total" value={currency(order.total)} /><Info label="Pagamento" value={order.paymentStatus === "paid" ? "Pago" : order.paymentStatus === "partial" ? "Parcial" : "Pendente"} /></div>

          {order.status === "ready" && <div className="rounded-2xl border border-black/10 p-4">
            <p className="flex items-center gap-2 font-bold"><QrCode size={18} />Retirada na pizzaria</p>
            <p className="mt-1 text-xs text-black/50">Use a câmera do celular no QR impresso ou digite os 6 dígitos da comanda.</p>
            <div className="mt-3 flex gap-2"><input inputMode="numeric" maxLength={6} className="input flex-1 text-center font-mono text-xl tracking-[.18em]" value={pickupCode} onChange={event => setPickupCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /><button className="btn-primary" disabled={Boolean(working)} onClick={() => void validatePickup("code")}>{working === "pickup" ? <Loader2 className="animate-spin" size={18} /> : <Crosshair size={18} />}Validar</button></div>
          </div>}

          {order.status === "out_for_delivery" && <div className="rounded-2xl border border-basso-gold/40 bg-basso-gold/10 p-4">
            <p className="flex items-center gap-2 font-bold"><KeyRound size={18} />Confirmação no cliente</p>
            <p className="mt-1 text-xs text-black/55">Peça ao cliente o código mostrado no acompanhamento do pedido. Esse código não aparece para o motoboy.</p>
            <input inputMode="numeric" maxLength={6} className="input mt-3 text-center font-mono text-2xl tracking-[.22em]" value={deliveryCode} onChange={event => setDeliveryCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
            {order.paymentStatus !== "paid" && <label className="mt-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><input type="checkbox" className="mt-1" checked={paymentReceived} onChange={event => setPaymentReceived(event.target.checked)} /><span><strong>Pagamento recebido na entrega</strong><br /><span className="text-xs text-black/50">Marque somente após receber/confirmar o valor indicado na comanda.</span></span></label>}
            <button className="btn-primary mt-3 w-full py-4 text-base" onClick={completeDelivery} disabled={Boolean(working)}>{working === "complete" ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}Confirmar entrega</button>
          </div>}
        </div>
      </article> : <div className="surface p-5">
        <div className="text-center"><Bike className="mx-auto text-black/20" size={48} /><h2 className="mt-4 font-display text-2xl font-bold">Escolha a próxima entrega</h2><p className="mt-2 text-sm text-black/50">Também é possível abrir a câmera do celular e escanear o QR da comanda impressa.</p></div>
        <div className="mt-5 space-y-3">{availableOrders.map(candidate => <button type="button" key={candidate.id} disabled={Boolean(working) || !driver?.shiftActive} onClick={() => void chooseDelivery(candidate.id)} className="w-full rounded-2xl border border-black/10 p-4 text-left transition hover:border-basso-wine hover:bg-basso-wine/5 disabled:opacity-50"><div className="flex items-start justify-between gap-3"><div><strong className="font-display text-xl">Pedido #{candidate.number}</strong><p className="mt-1 text-sm">{candidate.customerName} • {candidate.address?.district || "Endereço a conferir"}</p></div><strong className="text-basso-wine">{currency(candidate.total)}</strong></div><p className="mt-2 text-xs text-black/45">{working === `claim:${candidate.id}` ? "Assumindo pedido..." : "Toque para assumir esta entrega"}</p></button>)}{!availableOrders.length && <p className="rounded-xl bg-basso-paper p-5 text-center text-sm text-black/50">Nenhum pedido pronto para delivery neste momento.</p>}</div>
      </div>}
    </div>
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border p-3"><p className="text-[10px] font-bold uppercase text-black/40">{label}</p><p className="mt-1 font-bold">{value}</p></div>;
}
