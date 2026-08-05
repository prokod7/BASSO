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
  const [homeHref, setHomeHref] = useState("/");
  useEffect(() => {
    setStatus(storeStatus());
    const table = Number(new URLSearchParams(window.location.search).get("mesa"));
    if (Number.isInteger(table) && table >= 1 && table <= 15) setHomeHref(`/?mesa=${table}`);
  }, []);
  return <>
    <header className="sticky top-0 z-40 border-b border-black/5 bg-basso-paper/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
        <Link href={homeHref} className="flex min-w-0 items-center gap-3">
          <Image src="/assets/brand/logo.png" alt="La Forneria Basso" width={44} height={44} className="h-11 w-11 rounded-full object-cover" priority/>
          <div className="min-w-0"><p className="truncate font-display text-lg font-bold leading-none">La Forneria Basso</p><div className="mt-1 flex items-center gap-1.5 text-[11px]"><span className={`h-2 w-2 rounded-full ${status.open ? "bg-emerald-500" : "bg-red-500"}`}/><span className="font-semibold text-black/55">{status.label}</span></div></div>
        </Link>
        <div className="hidden items-center gap-1 md:flex"><Link className="btn-ghost" href="/meus-pedidos"><ShoppingBag size={18}/> Pedidos</Link><Link className="btn-ghost" href="/conta"><UserRound size={18}/> Minha conta</Link><button className="btn-ghost" aria-label="Notificações"><Bell size={18}/></button></div>
        <button className="relative flex h-11 items-center gap-2 rounded-xl bg-basso-wine px-3 text-white" onClick={() => cart.setOpen(true)} aria-label="Abrir carrinho">
          <ShoppingBag size={18}/><span className="hidden text-sm font-bold sm:block">{currency(cart.subtotal)}</span>{cart.count > 0 && <span className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-basso-gold px-1 text-xs font-black text-basso-black">{cart.count}</span>}
        </button>
      </div>
    </header>
  </>;
}

export function DeliveryModeSelector({ mode, onChange }: { mode: "delivery" | "pickup"; onChange: (v: "delivery" | "pickup") => void }) {
  return <div className="grid grid-cols-2 gap-2 rounded-2xl border border-black/5 bg-white p-1.5 shadow-sm">
    <button className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition ${mode === "delivery" ? "bg-basso-wine text-white shadow" : "text-black/55 hover:bg-black/5"}`} onClick={() => onChange("delivery")}><MapPin size={17}/> Entrega</button>
    <button className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition ${mode === "pickup" ? "bg-basso-wine text-white shadow" : "text-black/55 hover:bg-black/5"}`} onClick={() => onChange("pickup")}><Menu size={17}/> Retirada</button>
  </div>;
}
