"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Clock3, Instagram, MapPin, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PublicHeader, DeliveryModeSelector } from "@/components/public/PublicHeader";
import { CartDrawer } from "@/components/public/CartDrawer";
import { flavorsForEntry, PizzaMenuCard, type PizzaMenuEntry, type PizzaMenuScope } from "@/components/public/PizzaBuilder";
import { EnhancedPizzaBuilder } from "@/components/public/EnhancedPizzaBuilder";
import { ComboBuilder, type ComboOffer } from "@/components/public/ComboBuilder";
import { ProductCard } from "@/components/public/ProductCard";
import { catalog, categoryImages } from "@/lib/catalog";
import { currency, normalizeSearchText } from "@/lib/utils";
import type { MenuCategory, Product } from "@/types";

const pizzaNav = [["mais-pedidas","Mais pedidas"],["tradicionais","Tradicionais"],["premium","Premium"],["doces","Doces"]];
const pizzaSections:Array<{id:string;title:string;subtitle:string;scope:PizzaMenuScope;categoryId?:string}> = [
  {id:"mais-pedidas",title:"Mais pedidas",subtitle:"Escolha Grande ou Broto e monte sua pizza sem percorrer listas enormes.",scope:"featured"},
  {id:"tradicionais",title:"Pizzas Tradicionais",subtitle:"Sabores clássicos disponíveis agora. As categorias ajudam a encontrar o sabor; não limitam o meio a meio.",scope:"traditional",categoryId:"traditional"},
  {id:"premium",title:"Pizzas Premium",subtitle:"Criações especiais disponíveis agora. No meio a meio, você pode combinar sabores compatíveis.",scope:"premium",categoryId:"premium"},
  {id:"doces",title:"Pizzas Doces",subtitle:"Sabores doces disponíveis agora nos tamanhos Grande e Broto.",scope:"sweet",categoryId:"sweet"},
];

type RuntimeProduct={id:string;name:string;description?:string;category:string;price:number;active?:boolean;stockTracked?:boolean;image?:string;variant?:string;config?:ComboOffer["config"]};
type RuntimeMenuResponse={categories?:MenuCategory[];flavors?:Array<{id:string}>;addons?:Array<{id:string}>;products?:RuntimeProduct[]};
type StoreStatusResponse={deliveryAvailable?:boolean};

export default function HomePage(){
  const [mode,setMode]=useState<"delivery"|"pickup">("pickup");
  const [deliveryAvailable,setDeliveryAvailable]=useState(false);
  const [tableNumber,setTableNumber]=useState<number|null>(null);
  const [query,setQuery]=useState("");
  const [selectedPizza,setSelectedPizza]=useState<PizzaMenuEntry|null>(null);
  const [selectedCombo,setSelectedCombo]=useState<ComboOffer|null>(null);
  const [runtimeCombos,setRuntimeCombos]=useState<ComboOffer[]>([]);
  const [runtimeProducts,setRuntimeProducts]=useState<Product[]>([]);
  const [runtimeCategories,setRuntimeCategories]=useState<MenuCategory[]>([]);
  const [menuReady,setMenuReady]=useState(false);
  const [menuError,setMenuError]=useState("");

  useEffect(()=>{const table=Number(new URLSearchParams(window.location.search).get("mesa"));if(Number.isInteger(table)&&table>=1&&table<=15)setTableNumber(table)},[]);
  useEffect(()=>{let mounted=true;fetch("/api/store-status",{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error("Não foi possível consultar a cobertura de entrega.");return response.json() as Promise<StoreStatusResponse>}).then(body=>{if(!mounted)return;const available=body.deliveryAvailable===true;setDeliveryAvailable(available);if(!available)setMode("pickup")}).catch(()=>{if(!mounted)return;setDeliveryAvailable(false);setMode("pickup")});return()=>{mounted=false}},[]);

  useEffect(()=>{
    const channel=tableNumber?"table_qr":mode==="delivery"?"own_delivery":"pickup";
    const controller=new AbortController();setMenuReady(false);setMenuError("");
    fetch(`/api/menu/public?channel=${channel}`,{cache:"no-store",signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error("Não foi possível carregar o cardápio disponível agora.");return response.json() as Promise<RuntimeMenuResponse>}).then(body=>{
      const products=body.products||[];
      setRuntimeCategories(body.categories||[]);
      setRuntimeCombos(products.filter(product=>product.category==="combo").map(product=>({id:product.id,name:product.name,description:product.description||"",price:Number(product.price||0),config:product.config})));
      setRuntimeProducts(products.filter(product=>product.category!=="combo").map(product=>({id:product.id,name:product.name,description:product.description||"",category:product.category,price:Number(product.price||0),active:product.active!==false,stockTracked:product.stockTracked===true,image:product.image,variant:product.variant})));
      const availableFlavorIds=new Set((body.flavors||[]).map(flavor=>flavor.id));const availableAddonIds=new Set((body.addons||[]).map(addon=>addon.id));
      for(const flavor of catalog.flavors)flavor.active=availableFlavorIds.has(flavor.id);for(const addon of catalog.addons)addon.active=availableAddonIds.has(addon.id);
      setMenuReady(true);
    }).catch(error=>{if((error as Error).name==="AbortError")return;for(const flavor of catalog.flavors)flavor.active=false;for(const addon of catalog.addons)addon.active=false;setRuntimeCombos([]);setRuntimeProducts([]);setRuntimeCategories([]);setMenuError(error instanceof Error?error.message:"Cardápio temporariamente indisponível.");setMenuReady(true)});
    return()=>controller.abort();
  },[mode,tableNumber]);

  const normalized=normalizeSearchText(query);
  const products=useMemo(()=>runtimeProducts.filter(product=>!normalized||normalizeSearchText(`${product.name} ${product.description}`).includes(normalized)),[normalized,runtimeProducts]);
  const comboMatches=useMemo(()=>runtimeCombos.filter(combo=>!normalized||normalizeSearchText(`${combo.name} ${combo.description}`).includes(normalized)),[normalized,runtimeCombos]);
  const matchingCount=(entry:PizzaMenuEntry)=>{const source=flavorsForEntry(entry);if(!normalized)return source.length;return source.filter(flavor=>normalizeSearchText(`${flavor.name} ${flavor.description}`).includes(normalized)).length};
  const hasPizzaResult=pizzaSections.some(section=>(["grande","broto"] as const).some(size=>matchingCount({scope:section.scope,size})>0));
  const productCategories=runtimeCategories.filter(category=>category.active&&category.kind!=="pizza"&&category.id!=="combo"&&products.some(product=>product.category===category.id));
  const nav=[...pizzaNav,...(comboMatches.length?[["combo",runtimeCategories.find(category=>category.id==="combo")?.name||"Promoção"]]:[]),...productCategories.map(category=>[category.id,category.name])];

  return <main className="min-h-screen bg-basso-paper">
    <PublicHeader/>
    <section className="relative overflow-hidden bg-basso-black text-white"><Image src="/assets/brand/banner-institucional.png" alt="La Forneria Basso" fill priority className="object-cover opacity-55"/><div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent"/><div className="relative mx-auto grid max-w-7xl gap-6 px-4 py-7 md:grid-cols-[1.25fr_.75fr] md:gap-8 md:px-6 md:py-16"><div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[11px] font-bold text-basso-goldLight sm:text-xs"><Sparkles size={14}/> Massa de longa fermentação</span><h1 className="mt-4 font-display text-3xl font-bold leading-tight sm:mt-5 sm:text-5xl">Pizza artesanal com alma italiana.</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75 sm:mt-4 sm:text-base">Sabores tradicionais, criações premium e doces preparados para uma experiência acolhedora em Rio Grande da Serra.</p><div className="mt-4 flex flex-wrap gap-3 text-[11px] text-white/70 sm:mt-6 sm:text-xs"><span className="flex items-center gap-2"><Clock3 size={16} className="text-basso-goldLight"/> Terça a domingo, 18h às 23h</span><span className="flex items-center gap-2"><MapPin size={16} className="text-basso-goldLight"/> Rua do Progresso, 407</span></div></div><div className="self-end">{tableNumber?<div className="rounded-2xl border border-basso-gold/35 bg-black/45 p-4 text-center backdrop-blur sm:p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-basso-goldLight">Pedido pelo QR Code</p><p className="mt-2 font-display text-3xl font-bold">Mesa {tableNumber}</p><p className="mt-2 text-xs leading-relaxed text-white/65">Monte o pedido normalmente. No checkout, identifique sua comanda ou participante. O pagamento continua sob controle da equipe.</p></div>:<><DeliveryModeSelector mode={mode} onChange={setMode} deliveryAvailable={deliveryAvailable}/><p className="mt-2 text-center text-[11px] text-white/55 sm:text-xs">{deliveryAvailable?"Taxa e disponibilidade são calculadas no checkout conforme a região configurada.":"Entrega temporariamente indisponível. Retirada continua disponível."}</p></>}</div></div></section>

    <div className="sticky top-16 z-30 border-b border-black/5 bg-basso-paper/95 backdrop-blur-xl"><div className="mx-auto max-w-7xl px-4 py-2.5 md:px-6 md:py-3"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35" size={18}/><input className="input h-12 pl-10" placeholder="Buscar no cardápio" value={query} onChange={event=>setQuery(event.target.value)}/></div><nav className="scrollbar-none mt-2.5 flex gap-2 overflow-x-auto pb-1 md:mt-3">{nav.map(([id,label])=><a key={id} href={`#${id}`} className="chip shrink-0 hover:border-basso-gold hover:text-basso-wine">{label}</a>)}</nav></div></div>

    <div className="mx-auto max-w-7xl space-y-10 px-4 py-6 md:space-y-14 md:px-6 md:py-12">
      {menuError&&<div className="surface border border-amber-200 bg-amber-50 p-5 text-center"><p className="font-bold text-amber-900">Cardápio temporariamente indisponível</p><p className="mt-1 text-sm text-amber-800/70">{menuError} Tente novamente em instantes.</p></div>}
      {menuReady&&!menuError&&pizzaSections.map(section=>{const entries=(["grande","broto"] as const).map(size=>({scope:section.scope,size})).filter(entry=>matchingCount(entry)>0);if(!entries.length)return null;const runtimeTitle=section.categoryId?runtimeCategories.find(category=>category.id===section.categoryId)?.name:undefined;return <MenuSection key={section.id} id={section.id} title={runtimeTitle||section.title} subtitle={section.subtitle}><div className="grid gap-3 md:grid-cols-2 md:gap-4">{entries.map(entry=><PizzaMenuCard key={`${entry.scope}-${entry.size}`} entry={entry} onOpen={setSelectedPizza} resultCount={normalized?matchingCount(entry):undefined}/>)}</div>{section.scope==="sweet"&&<div className="mt-4 rounded-2xl border border-basso-gold/30 bg-basso-gold/10 p-4 text-sm"><strong>Base adicional: Creme de Avelã Zero</strong><span className="ml-2 text-basso-wine">{currency(2500)}</span><p className="mt-1 text-xs text-black/55">A base pode ser selecionada ao finalizar a pizza. Pizzas doces vão sem corte por padrão para evitar vazamento do recheio, mas o cliente pode pedir para cortar.</p></div>}</MenuSection>})}
      {comboMatches.length>0&&<MenuSection id="combo" title={runtimeCategories.find(category=>category.id==="combo")?.name||"Promoção"} subtitle="Promoções aparecem somente quando todos os componentes obrigatórios possuem opção disponível no estoque."><div className="grid gap-4 lg:grid-cols-2">{comboMatches.map(combo=><article key={combo.id} className="surface grid overflow-hidden sm:grid-cols-[180px_1fr]"><div className="relative min-h-44 sm:min-h-52"><Image src={categoryImages.combo} alt={combo.name} fill className="object-cover"/></div><div className="flex flex-col justify-center p-4 sm:p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-basso-gold">Promoção</p><h3 className="mt-2 font-display text-xl font-bold sm:text-2xl">{combo.name}</h3><p className="mt-2 text-sm leading-relaxed text-black/55">{combo.description}</p><div className="mt-4 flex items-center justify-between gap-4 sm:mt-5"><strong className="text-xl text-basso-wine">{currency(combo.price)}</strong><button type="button" className="btn-primary" onClick={()=>setSelectedCombo(combo)}>Configurar <ChevronRight size={18}/></button></div></div></article>)}</div></MenuSection>}
      {productCategories.map(category=>{const categoryProducts=products.filter(product=>product.category===category.id);if(!categoryProducts.length)return null;return <MenuSection key={category.id} id={category.id} title={category.name} subtitle={`${categoryProducts.length} item(ns) disponível(is) agora.`}><div className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">{categoryProducts.map(product=><ProductCard key={product.id} product={product}/>)}</div></MenuSection>})}
      {menuReady&&!menuError&&normalized&&!hasPizzaResult&&products.length===0&&comboMatches.length===0&&<div className="surface p-10 text-center"><p className="font-display text-2xl font-bold">Nenhum item encontrado</p><p className="mt-2 text-sm text-black/50">Tente buscar por outro nome ou ingrediente.</p></div>}
    </div>

    <footer className="border-t border-white/10 bg-basso-black text-white"><div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3 md:px-6"><div><Image src="/assets/brand/logo.png" alt="" width={72} height={72} className="rounded-full"/><p className="mt-3 font-display text-xl font-bold">La Forneria Basso</p><p className="mt-2 text-sm text-white/55">Pizzaria artesanal • massa de longa fermentação.</p></div><div><p className="font-bold">Contato</p><p className="mt-3 text-sm text-white/60">(11) 97235-6751</p><p className="mt-1 text-sm text-white/60">Rua do Progresso, 407, Centro, Rio Grande da Serra/SP</p><a href="https://instagram.com/laforneriabasso" className="mt-3 inline-flex items-center gap-2 text-sm text-basso-goldLight"><Instagram size={16}/> @laforneriabasso</a></div><div><p className="font-bold">Informações</p><div className="mt-3 flex flex-col gap-2 text-sm text-white/60"><Link href="/privacidade">Política de privacidade</Link><Link href="/termos">Termos de uso</Link><Link href="/login">Acesso da equipe</Link></div></div></div></footer>
    <EnhancedPizzaBuilder entry={selectedPizza} open={Boolean(selectedPizza)} onClose={()=>setSelectedPizza(null)}/><ComboBuilder open={Boolean(selectedCombo)} onClose={()=>setSelectedCombo(null)} combo={selectedCombo||undefined}/><CartDrawer/>
  </main>;
}

function MenuSection({id,title,subtitle,children}:{id:string;title:string;subtitle:string;children:React.ReactNode}){return <section id={id} className="scroll-mt-44"><div className="mb-4 sm:mb-5"><h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2><p className="mt-1 text-xs leading-relaxed text-black/50 sm:text-sm">{subtitle}</p></div>{children}</section>}
