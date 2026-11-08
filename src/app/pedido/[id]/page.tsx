"use client";

import { itemDetails } from "@/lib/item-presentation";
import Image from "next/image";
import Link from "next/link";
import { Check, Copy, ChevronLeft, KeyRound, MapPin, MessageCircle, Navigation, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import type { Order } from "@/types";
import { useDemoState } from "@/lib/demo-store";
import { allowedStatuses, statusLabel } from "@/lib/order-validation";
import { currency, shortDateTime } from "@/lib/utils";
import { paymentMethodLabels } from "@/lib/payment-methods";
import { PixPaymentCard } from "@/components/public/PixPaymentCard";
import { useStoreAvailability } from "@/components/public/useStoreAvailability";
import { customerDeviceActions, useCustomerDeviceState } from "@/lib/customer-device-store";

const OperationalMap = dynamic(() => import("@/components/maps/OperationalMap").then(module => module.OperationalMap), { ssr: false });

function OrderTrackingContent() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const savedToken=useCustomerDeviceState(state=>state.orders.find(order=>order.id===id)?.token);
  const token = search.get("token") || savedToken;
  const store=useStoreAvailability();
  const [connection,setConnection]=useState("Conectando ao acompanhamento…");
  const [copied,setCopied]=useState(false);
  const localOrder = useDemoState(state => state.orders.find(order => order.id === id));
  const [remoteOrder, setRemoteOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(!localOrder && Boolean(token));

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let active = true, live = false;
    const accept=(body:Order)=>{
      if(!active)return;
      setRemoteOrder(body);setLoading(false);
      customerDeviceActions.saveOrder({id,token,phone:body.customerPhone||"",status:body.status,total:body.total,number:Number(body.number),items:body.items,createdAt:body.createdAt});
    };
    const load=async()=>{
      try{
        const response=await fetch(`/api/public-orders/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,{cache:'no-store'});
        if(!response.ok)throw new Error();
        accept(await response.json());
      }catch{if(active){setLoading(false);setConnection('Reconectando ao acompanhamento…');}}
    };
    void load();
    const events=new EventSource(`/api/public-orders/${encodeURIComponent(id)}/events?token=${encodeURIComponent(token)}`);
    events.addEventListener('order',event=>{try{accept(JSON.parse((event as MessageEvent).data));live=true;setConnection('Atualização automática em tempo real');}catch{}});
    events.addEventListener('expired',()=>{events.close();live=false;setConnection('Este link expirou. Entre em contato com a pizzaria.');});
    events.onerror=()=>{live=false;if(active)setConnection('Reconectando — atualização automática mantida');};
    const refresh=()=>{if(document.visibilityState==='visible')void load();};
    const timer=window.setInterval(()=>{if(!live)refresh();},5000);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{active=false;events.close();window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[id,token]);

  const order = remoteOrder || localOrder;
  if (loading) return <main className="grid min-h-screen place-items-center bg-basso-paper"><PackageCheck className="animate-pulse text-basso-wine" size={48} /></main>;
  if (!order) return <main className="grid min-h-screen place-items-center bg-basso-paper p-6"><div className="surface max-w-md p-8 text-center"><PackageCheck className="mx-auto text-black/20" size={48} /><h1 className="mt-4 font-display text-2xl font-bold">Pedido não encontrado</h1><p className="mt-2 text-sm text-black/50">O pedido pode estar em outra base ou o link não é válido neste dispositivo.</p><Link className="btn-primary mt-6 w-full" href="/">Voltar ao cardápio</Link></div></main>;

  const statuses = allowedStatuses(order.channel).filter(status => status !== "cancelled");
  const current = order.status === "cancelled" ? -1 : statuses.indexOf(order.status);
  const showDeliveryCode = order.channel === "own_delivery" && ["ready", "out_for_delivery"].includes(order.status) && Boolean(order.deliveryCode);

  return <main className="min-h-screen bg-basso-paper">
    <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4"><Link href="/" className="btn-ghost"><ChevronLeft size={18} /></Link><Image src="/assets/brand/logo.png" alt="" width={40} height={40} className="rounded-full" /><div><p className="font-display font-bold">Pedido #{order.number}</p><p className="text-[11px] text-black/40">Atualizado {shortDateTime(order.updatedAt)}</p></div></div></header>

    <div className="mx-auto max-w-4xl space-y-5 px-4 py-7">
      <section className="surface p-4"><p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-emerald-800"><span className="h-2 w-2 rounded-full bg-emerald-600"/>{connection}</p><div className="mt-3 flex flex-wrap gap-2"><Link href="/meus-pedidos" className="btn-secondary">Meus pedidos</Link><button type="button" className="btn-secondary" onClick={async()=>{try{const url=new URL(`/pedido/${encodeURIComponent(id)}`,location.origin);if(token)url.searchParams.set('token',token);await navigator.clipboard.writeText(url.toString());setCopied(true);}catch{setCopied(false);}}}><Copy size={16}/>{copied?'Link copiado':'Copiar link de acompanhamento'}</button></div></section>

      <section className="surface overflow-hidden">
        <div className="bg-basso-black p-6 text-white"><p className="text-xs uppercase tracking-[.18em] text-basso-goldLight">Acompanhamento</p><h1 className="mt-2 font-display text-3xl font-bold">{statusLabel[order.status]}</h1><p className="mt-2 text-sm text-white/60">Olá, {order.customerName}. Acompanhe aqui somente o seu pedido.</p></div>
        <div className="p-5 sm:p-7"><div className="space-y-0">{statuses.map((status, index) => { const done = current >= index; const active = current === index; return <div key={status} className="flex gap-4"><div className="flex flex-col items-center"><span className={`grid h-9 w-9 place-items-center rounded-full border-2 ${done ? "border-basso-wine bg-basso-wine text-white" : "border-black/15 bg-white text-black/30"}`}>{done ? <Check size={17} /> : index + 1}</span>{index < statuses.length - 1 && <span className={`h-11 w-0.5 ${current > index ? "bg-basso-wine" : "bg-black/10"}`} />}</div><div className="pt-2"><p className={`text-sm font-bold ${active ? "text-basso-wine" : ""}`}>{statusLabel[status]}</p>{active && <p className="mt-1 text-xs text-black/45">Etapa atual do pedido.</p>}</div></div>; })}</div></div>
      </section>

      {showDeliveryCode && <section className="overflow-hidden rounded-3xl border-2 border-basso-wine bg-white shadow-sm">
        <div className="bg-basso-wine px-5 py-4 text-white"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em]"><KeyRound size={17} />Código de confirmação da entrega</p></div>
        <div className="p-6 text-center"><p className="text-sm text-black/55">Informe este código ao motoboy somente quando o pedido chegar até você.</p><p className="mt-4 font-mono text-4xl font-black tracking-[.24em] text-basso-wine">{order.deliveryCode}</p><div className="mx-auto mt-4 flex max-w-md items-start gap-2 rounded-xl bg-basso-paper p-3 text-left text-xs text-black/55"><ShieldCheck className="mt-0.5 shrink-0 text-basso-wine" size={16} /><p>O motoboy não recebe este código pelo sistema. A entrega só pode ser concluída depois da sua confirmação.</p></div></div>
      </section>}

      {order.status === "out_for_delivery" && order.trackingToken && <Link href={`/acompanhar/${encodeURIComponent(order.trackingToken)}`} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-basso-wine px-5 py-4 text-center font-bold text-white shadow-sm transition hover:brightness-110"><Navigation size={20} />Acompanhar motoboy no mapa</Link>}

      {order.status === "out_for_delivery" && <section className="surface overflow-hidden p-3"><OperationalMap points={typeof order.address?.latitude === "number" && typeof order.address?.longitude === "number" ? [{ id: `destination-${order.id}`, latitude: order.address.latitude, longitude: order.address.longitude, label: `Destino do pedido #${order.number}`, kind: "destination" }] : []} className="h-72" /><div className="flex items-start gap-2 p-3 text-xs text-black/50"><MapPin className="mt-0.5 shrink-0" size={15} /><p>O botão acima abre o rastreamento temporário com a posição do motoboy. O acesso é encerrado assim que a entrega for confirmada.</p></div></section>}

      <section className="surface p-5"><h2 className="font-display text-xl font-bold">Resumo</h2><div className="mt-4 space-y-3">{order.items.map(item => <div key={item.id} className="flex justify-between gap-4 text-sm"><div><p><strong>{item.quantity}×</strong> {item.name}</p><div className="mt-1 space-y-1 whitespace-pre-wrap text-xs text-black/65">{itemDetails(item).map((line, i) => <p key={i} className={line.emphasis ? "font-semibold" : ""}>{line.text}</p>)}</div></div><strong>{currency(item.unitPrice * item.quantity)}</strong></div>)}</div><div className="mt-4 space-y-1.5 border-t pt-4 text-sm"><div className="flex justify-between"><span className="text-black/60">Subtotal</span><span>{currency(order.subtotal)}</span></div>{order.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Desconto</span><span>− {currency(order.discount)}</span></div>}{order.channel === "own_delivery" && <div className="flex justify-between"><span className="text-black/60">Entrega</span><span>{order.deliveryFee ? currency(order.deliveryFee) : "Grátis"}</span></div>}{order.paymentMethod && <div className="flex justify-between"><span className="text-black/60">Pagamento</span><span>{paymentMethodLabels[order.paymentMethod] || order.paymentMethod}{order.changeFor ? ` (troco para ${currency(order.changeFor)})` : ""}</span></div>}</div><div className="mt-3 flex justify-between border-t pt-3"><strong>Total</strong><strong className="text-lg text-basso-wine">{currency(order.total)}</strong></div></section>
      {order.paymentMethod === "pix" && order.paymentStatus !== "paid" && order.status !== "cancelled" && order.channel !== "table_qr" && <PixPaymentCard total={order.total}/>}

      <div className="grid gap-3 sm:grid-cols-2"><a className="btn-secondary" href={`https://wa.me/${store.whatsapp || "5511998805533"}?text=${encodeURIComponent(`Olá! Gostaria de falar sobre o pedido #${order.number}.`)}`} target="_blank"><MessageCircle size={18} />Falar manualmente no WhatsApp</a><button className="btn-secondary" onClick={() => location.reload()}><RefreshCw size={18} />Atualizar</button>{order.status === "completed" && <Link className="btn-primary sm:col-span-2" href={`/avaliar/${order.id}${token ? `?token=${encodeURIComponent(token)}` : ""}`}>Avaliar pedido</Link>}</div>
    </div>
  </main>;
}

export default function OrderTrackingPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-basso-paper"><PackageCheck className="animate-pulse text-basso-wine" size={48} /></main>}><OrderTrackingContent /></Suspense>;
}

