"use client";
import Image from "next/image";
import Link from "next/link";
import { Bell, MapPin, Menu, ShoppingBag, UserRound } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { storeStatus } from "@/lib/opening-hours";
import { currency } from "@/lib/utils";
import { useEffect, useState } from "react";

export function PublicHeader() {
  const cart = useCart();
  const [status, setStatus] = useState({ open: false, label: "Consultando..." });
  const [businessName,setBusinessName]=useState("La Forneria Basso");
  const [homeHref, setHomeHref] = useState("/");

  useEffect(() => {
    let mounted = true;
    async function refreshStatus() {
      const schedule = storeStatus();
      if (mounted) setStatus(schedule);
      try {
        const response = await fetch("/api/store-status", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok || !mounted) return;
        if(typeof body.business?.name==="string")setBusinessName(body.business.name);
        const open = Boolean(body.acceptingOrders && body.operationalStatus === "open");
        const serverSchedule = {open:body.scheduledOpen===true,label:body.scheduleLabel||"Loja fechada"};
        let label = serverSchedule.label;
        if (open) label = serverSchedule.open ? serverSchedule.label : "Pedidos abertos";
        else if (body.operationalStatus === "paused") label = body.pauseReason || "Pedidos pausados";
        else if (serverSchedule.open) label = body.publicMessage || "Loja fechada no momento";
        setStatus({ open, label });
      } catch {}
    }
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 30_000);
    const table = Number(new URLSearchParams(window.location.search).get("mesa"));
    if (Number.isInteger(table) && table >= 1 && table <= 15) setHomeHref(`/?mesa=${table}`);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  return <>
    <header className="sticky top-0 z-40 border-b border-black/5 bg-basso-paper/95 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2.5 px-3 sm:gap-3 sm:px-4 md:px-6">
        <Link href={homeHref} className="flex min-w-0 items-center gap-2.5 sm:gap-3"><Image src="/assets/brand/logo-oficial.webp" alt="La Forneria Basso" width={44} height={44} className="h-9 w-9 shrink-0 rounded-full object-cover sm:h-11 sm:w-11" priority/><div className="min-w-0"><p className="max-w-[180px] truncate font-display text-[15px] font-black leading-none sm:max-w-none sm:text-lg">{businessName}</p><div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] sm:text-[11px]"><span className={`h-2 w-2 shrink-0 rounded-full ${status.open ? "bg-emerald-500" : "bg-red-500"}`}/><span className="truncate font-semibold text-black/50">{status.label}</span></div></div></Link>
        <div className="hidden items-center gap-1 md:flex"><Link className="btn-ghost" href="/meus-pedidos"><ShoppingBag size={18}/> Meus pedidos</Link><Link className="btn-ghost" href="/conta"><UserRound size={18}/> Minha conta</Link><button type="button" className="btn-ghost" aria-label="Ativar notificações" onClick={async () => { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); }} title="Ativar notificações do navegador"><Bell size={18}/></button></div>
        <Link href="/meus-pedidos" className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-black/10 px-2 text-[11px] font-bold text-basso-wine md:hidden"><ShoppingBag size={15}/>Meus pedidos</Link>
        <button type="button" className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-basso-wine text-white shadow-sm sm:flex sm:w-auto sm:items-center sm:gap-2 sm:rounded-xl sm:px-3" onClick={() => cart.setOpen(true)} aria-label="Abrir carrinho"><ShoppingBag size={18}/><span className="hidden text-sm font-bold sm:block">{currency(cart.subtotal)}</span>{cart.count > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-basso-gold px-1 text-[10px] font-black text-basso-black sm:-right-2 sm:-top-2 sm:h-6 sm:min-w-6 sm:text-xs">{cart.count}</span>}</button>
      </div>
    </header>

  </>;
}

export function DeliveryModeSelector({ mode, onChange, deliveryAvailable = true }: { mode: "delivery" | "pickup"; onChange: (value: "delivery" | "pickup") => void; deliveryAvailable?: boolean; }) {
  return <div className="grid grid-cols-2 gap-1 rounded-2xl border border-black/5 bg-white p-1 shadow-sm sm:gap-2 sm:p-1.5"><button type="button" disabled={!deliveryAvailable} aria-disabled={!deliveryAvailable} title={deliveryAvailable ? "Receber por entrega" : "Entrega temporariamente indisponível"} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${mode === "delivery" && deliveryAvailable ? "bg-basso-wine text-white shadow" : "text-black/55 hover:bg-black/5"}`} onClick={() => deliveryAvailable && onChange("delivery")}><MapPin size={17}/> Entrega</button><button type="button" className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${mode === "pickup" ? "bg-basso-wine text-white shadow" : "text-black/55 hover:bg-black/5"}`} onClick={() => onChange("pickup")}><Menu size={17}/> Retirada</button></div>;
}
