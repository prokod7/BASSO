"use client";
import Image from "next/image";
import { Check, Heart, Minus, Plus, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { catalog, categoryImages, findFlavor } from "@/lib/catalog";
import { pizzaTotal, validatePizzaSelection } from "@/lib/pricing";
import type { CartItem, Flavor, PizzaSelection } from "@/types";
import { currency, uid } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import { Modal } from "@/components/ui/Modal";
import { customerDeviceActions, useCustomerDeviceState } from "@/lib/customer-device-store";

function compatible(first: Flavor, candidate: Flavor) {
  if (first.category === "premium" && candidate.category === "traditional") return false;
  if (first.category === "traditional" && candidate.category === "premium") return false;
  return true;
}

export function PizzaCard({ flavor, onOpen }: { flavor: Flavor; onOpen: (f: Flavor) => void }) {
  const min = Math.min(flavor.priceGrande, flavor.priceBroto);
  const ref = `flavor:${flavor.id}`;
  const favorite = useCustomerDeviceState(state => state.favorites.includes(ref));
  return <article className="surface group relative flex min-h-[168px] overflow-hidden transition hover:-translate-y-0.5 hover:shadow-premium">
    <button type="button" className={`absolute right-3 top-3 z-10 rounded-full p-2 ${favorite?"bg-red-50 text-red-600":"bg-black/5 text-black/35"}`} onClick={()=>customerDeviceActions.toggleFavorite(ref)} aria-label={favorite?"Remover dos favoritos":"Adicionar aos favoritos"}><Heart size={16} fill={favorite?"currentColor":"none"}/></button>
    <div className="flex min-w-0 flex-1 flex-col p-4"><div className="flex items-center gap-2 pr-10"><h3 className="font-display text-lg font-bold leading-tight">{flavor.name}</h3>{flavor.featured && <span className="rounded-full bg-basso-gold/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-basso-wine">Mais pedida</span>}</div><p className="mt-2 line-clamp-3 text-xs leading-relaxed text-black/55">{flavor.description}</p><div className="mt-auto flex items-end justify-between gap-3 pt-4"><div><span className="text-[10px] uppercase tracking-wide text-black/40">A partir de</span><strong className="block text-base text-basso-wine">{currency(min)}</strong></div><button className="grid h-10 w-10 place-items-center rounded-full bg-basso-wine text-white transition group-hover:scale-105" onClick={() => onOpen(flavor)} aria-label={`Montar pizza ${flavor.name}`}><Plus size={19}/></button></div></div>
  </article>;
}

const initial = (flavorId: string): PizzaSelection => ({ size: "grande", mass: "traditional", flavorA: flavorId, removedA: [], removedB: [], addons: {}, notes: "" });
export function PizzaBuilder({ flavor, open, onClose, onAdd }: { flavor: Flavor | null; open: boolean; onClose: () => void; onAdd?: (item: CartItem) => void }) {
  const cart = useCart();
  const [selection, setSelection] = useState<PizzaSelection>(() => initial(flavor?.id || catalog.flavors[0].id));
  const [error, setError] = useState("");
  const currentA = findFlavor(selection.flavorA)!;
  const currentB = selection.flavorB ? findFlavor(selection.flavorB) : undefined;
  const compatibleFlavors = useMemo(() => catalog.flavors.filter(f => f.active && compatible(currentA, f)), [currentA]);
  const total = useMemo(() => { try { return pizzaTotal(selection); } catch { return 0; } }, [selection]);

  const resetFor = (f: Flavor) => { setSelection(initial(f.id)); setError(""); };
  // Modal may switch product without unmounting.
  const keyedFlavor = flavor?.id;
  useEffect(() => {
    if (flavor && selection.flavorA !== flavor.id && open) resetFor(flavor);
    // Reset only when the product opened in the modal changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyedFlavor, open]);

  const toggleRemoved = (half: "A" | "B", ingredient: string) => setSelection(s => {
    const key = half === "A" ? "removedA" : "removedB";
    const list = s[key];
    return { ...s, [key]: list.includes(ingredient) ? list.filter(i => i !== ingredient) : [...list, ingredient] };
  });
  const setAddon = (id: string, delta: number) => setSelection(s => {
    const current = s.addons[id] || 0;
    const next = Math.max(0, Math.min(2, current + delta));
    const sumWithout = Object.entries(s.addons).filter(([key]) => key !== id).reduce((sum, [, q]) => sum + q, 0);
    if (sumWithout + next > 5) return s;
    return { ...s, addons: { ...s.addons, [id]: next } };
  });
  const add = () => {
    try {
      validatePizzaSelection(selection);
      const a = findFlavor(selection.flavorA)!;
      const b = selection.flavorB ? findFlavor(selection.flavorB) : undefined;
      const name = `Pizza ${selection.size === "grande" ? "Grande" : "Broto"} • ${a.name}${b ? ` / ${b.name}` : ""}`;
      const item: CartItem = { id: uid("cart"), kind: "pizza", name, quantity: 1, unitPrice: pizzaTotal(selection), image: categoryImages[a.category][selection.size], selection };
      if (onAdd) onAdd(item); else cart.addItem(item);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível adicionar a pizza."); }
  };
  if (!flavor) return null;
  return <Modal open={open} onClose={onClose} title="Monte sua pizza" className="sm:max-w-3xl">
    <div className="grid md:grid-cols-[260px_1fr]">
      <div className="relative min-h-48 bg-basso-black md:min-h-full"><Image src={categoryImages[currentA.category][selection.size]} alt={`Pizza ${currentA.category}`} fill className="object-cover opacity-85"/><div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent"/><div className="absolute bottom-0 p-5 text-white"><p className="text-xs uppercase tracking-[.2em] text-basso-goldLight">Pizza artesanal</p><h3 className="mt-1 font-display text-2xl font-bold">{currentA.name}{currentB ? ` + ${currentB.name}` : ""}</h3><p className="mt-2 text-xs text-white/70">Imagem geral da categoria e tamanho selecionados.</p></div></div>
      <div className="space-y-6 p-5">
        <section><p className="label">1. Tamanho</p><div className="grid grid-cols-2 gap-2">{(["grande","broto"] as const).map(size => <button key={size} className={`rounded-xl border p-3 text-left ${selection.size === size ? "border-basso-wine bg-basso-wine/5 ring-1 ring-basso-wine" : "border-black/10 bg-white"}`} onClick={() => setSelection(s => ({ ...s, size, flavorB: size === "broto" ? undefined : s.flavorB, removedB: size === "broto" ? [] : s.removedB }))}><span className="block font-bold">{size === "grande" ? "Grande" : "Broto"}</span><span className="text-xs text-black/45">{size === "grande" ? "Até 2 sabores" : "Somente 1 sabor"}</span></button>)}</div></section>
        <section><p className="label">2. Massa</p><div className="grid gap-2 sm:grid-cols-2">{catalog.masses.map(mass => <button key={mass.id} className={`rounded-xl border p-3 text-left text-sm font-semibold ${selection.mass === mass.id ? "border-basso-wine bg-basso-wine/5 ring-1 ring-basso-wine" : "border-black/10 bg-white"}`} onClick={() => setSelection(s => ({ ...s, mass: mass.id as PizzaSelection["mass"] }))}>{selection.mass === mass.id && <Check size={15} className="mr-1 inline"/>}{mass.name}<span className="block text-xs font-normal text-emerald-700">Sem acréscimo</span></button>)}</div></section>
        <section><p className="label">3. Sabores</p><label className="mb-2 block text-xs font-semibold text-black/55">Primeiro sabor</label><select className="input" value={selection.flavorA} onChange={e => setSelection(s => ({ ...s, flavorA: e.target.value, flavorB: undefined, removedA: [], removedB: [] }))}>{catalog.flavors.map(f => <option key={f.id} value={f.id}>{f.name} — {currency(selection.size === "grande" ? f.priceGrande : f.priceBroto)}</option>)}</select>{selection.size === "grande" && <><label className="mb-2 mt-3 block text-xs font-semibold text-black/55">Segundo sabor (opcional)</label><select className="input" value={selection.flavorB || ""} onChange={e => setSelection(s => ({ ...s, flavorB: e.target.value || undefined, removedB: [] }))}><option value="">Pizza inteira com um sabor</option>{compatibleFlavors.map(f => <option key={f.id} value={f.id}>{f.name} — metade de {currency(f.priceGrande)}</option>)}</select><p className="mt-2 text-xs text-black/45">Meio a meio = 50% de cada sabor. Premium não combina com Tradicional.</p></>}</section>
        <section><p className="label">4. Retirar ingredientes</p><div className="space-y-3"><IngredientList title={currentA.name} ingredients={currentA.ingredients} selected={selection.removedA} onToggle={i => toggleRemoved("A", i)}/>{currentB && <IngredientList title={currentB.name} ingredients={currentB.ingredients} selected={selection.removedB} onToggle={i => toggleRemoved("B", i)}/>}</div></section>
        <section><div className="flex items-center justify-between"><p className="label mb-0">5. Adicionais</p><span className="text-xs text-black/45">Máx. 5 unidades; 2 por adicional</span></div><div className="mt-2 divide-y divide-black/5 rounded-xl border border-black/10 bg-white">{catalog.addons.map(addon => { const q = selection.addons[addon.id] || 0; return <div key={addon.id} className="flex items-center justify-between gap-3 p-3"><div><p className="text-sm font-semibold">{addon.name}</p><p className="text-xs text-basso-wine">{currency(addon.price)} por unidade</p></div><div className="flex items-center rounded-lg border border-black/10"><button className="p-2 disabled:opacity-30" disabled={!q} onClick={() => setAddon(addon.id, -1)}><Minus size={15}/></button><span className="w-7 text-center text-xs font-bold">{q}</span><button className="p-2 disabled:opacity-30" disabled={q >= 2 || Object.values(selection.addons).reduce((a,b)=>a+b,0)>=5} onClick={() => setAddon(addon.id, 1)}><Plus size={15}/></button></div></div>; })}</div></section>
        <section><label className="label" htmlFor="pizza-notes">6. Observações</label><textarea id="pizza-notes" className="textarea" maxLength={500} value={selection.notes} onChange={e => setSelection(s => ({ ...s, notes: e.target.value }))} placeholder="Ex.: assar bem, cortar em 8 pedaços..."/><p className="mt-1 text-right text-xs text-black/40">{selection.notes.length}/500</p></section>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <button className="btn-primary sticky bottom-0 w-full py-3.5" onClick={add}><ShoppingBag size={19}/> Adicionar ao carrinho • {currency(total)}</button>
      </div>
    </div>
  </Modal>;
}

function IngredientList({ title, ingredients, selected, onToggle }: { title: string; ingredients: string[]; selected: string[]; onToggle: (ingredient: string) => void }) {
  return <div className="rounded-xl border border-black/10 bg-white p-3"><p className="mb-2 text-xs font-bold text-basso-wine">{title}</p><div className="flex flex-wrap gap-2">{ingredients.map(ingredient => <button key={ingredient} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selected.includes(ingredient) ? "border-red-300 bg-red-50 text-red-700 line-through" : "border-black/10 bg-basso-paper"}`} onClick={() => onToggle(ingredient)}>{ingredient}</button>)}</div></div>;
}
