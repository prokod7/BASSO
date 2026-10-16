"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { currency } from "@/lib/utils";

export type PublicPromotion = {
  id: string;
  name: string;
  description?: string;
  badgeText?: string;
  image?: string;
  promoPrice: number;
  pizzaSize?: "grande" | "broto";
  targets: Array<{ id: string; productId?: string; flavorId?: string; label?: string }>;
};

export function DailyPromotions({promotions,onChoose}:{promotions:PublicPromotion[];onChoose?:(flavorId:string,size?:"grande"|"broto")=>void}) {

  if (!promotions.length) return null;

  return <section id="promocoes-do-dia" className="border-b border-basso-gold/20 bg-gradient-to-r from-[#fff9ea] via-white to-[#fff9ea]">
    <div className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-7">
      <div className="mb-3 flex items-center justify-between gap-3"><div><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.18em] text-basso-wine"><Sparkles size={14}/> Ativas agora</p><h2 className="mt-1 font-display text-2xl font-black md:text-3xl">Promoções do dia</h2></div><span className="rounded-full bg-basso-wine px-3 py-1.5 text-[10px] font-black text-white">{promotions.length} {promotions.length === 1 ? "oferta" : "ofertas"}</span></div>
      <div className="scrollbar-none flex snap-x gap-3 overflow-x-auto pb-1">{promotions.map(promotion => <article key={promotion.id} className="surface min-w-[285px] max-w-[360px] snap-start overflow-hidden sm:min-w-[330px]"><div className="flex gap-3 p-4">{promotion.image ? <img src={promotion.image} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover"/> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-basso-wine/10 text-basso-wine"><Sparkles size={24}/></div>}<div className="min-w-0 flex-1"><span className="rounded-full bg-basso-gold/20 px-2 py-1 text-[9px] font-black uppercase text-basso-wine">{promotion.badgeText || "Promoção do dia"}</span><h3 className="mt-2 line-clamp-2 font-display text-lg font-black">{promotion.name}</h3><p className="mt-1 text-xl font-black text-basso-wine">{currency(promotion.promoPrice)}</p></div></div>{promotion.description && <p className="px-4 pb-2 text-xs leading-relaxed text-black/50">{promotion.description}</p>}<div className="border-t px-4 py-3 text-[11px] text-black/45"><strong>{promotion.pizzaSize ? `Pizza ${promotion.pizzaSize === "grande" ? "Grande" : "Broto"}` : "Itens participantes"}</strong>{promotion.targets.length > 0 && <span> • {promotion.targets.slice(0, 3).map(target => target.label).filter(Boolean).join(", ")}{promotion.targets.length > 3 ? "…" : ""}</span>}</div>{onChoose&&promotion.targets.some(t=>t.flavorId)&&<button className="btn-primary m-4 min-h-11" onClick={()=>onChoose(promotion.targets.find(t=>t.flavorId)!.flavorId!,promotion.pizzaSize)}>Escolher pizza</button>}</article>)}</div>
    </div>
  </section>;
}

