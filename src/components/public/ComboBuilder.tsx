"use client";
import Image from "next/image";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { catalog, categoryImages, findFlavor, findProduct } from "@/lib/catalog";
import { arePizzaFlavorsCompatible, comboTotal } from "@/lib/pricing";
import { currency, uid } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import { Modal } from "@/components/ui/Modal";
import type { AddonPlacement, ComboSelection } from "@/types";

export interface ComboOffer { id:string; name:string; description:string; price:number; config?:{ grandeFlavors?:string[]; beverages?:string[]; sweetFlavor?:string; masses?:string[]; allowHalfHalf?:boolean; allowAddonPlacement?:boolean } }
type ComboSelectionWithSweetCut = ComboSelection & { sweetCutPreference: "uncut" | "cut" };
const defaultSelection: ComboSelectionWithSweetCut = { mass: "traditional", grandeFlavor: "calabresa-tradicional", brigadeiroBase: "chocolate-ao-leite", beverage: "guarana-antarctica-2-l", addons: {}, addonPlacements: {}, notes: "", sweetCutPreference: "uncut" };

export function ComboBuilder({ open, onClose, combo = catalog.combo as unknown as ComboOffer }: { open: boolean; onClose: () => void; combo?: ComboOffer }) {
  const [selection, setSelection] = useState<ComboSelectionWithSweetCut>(defaultSelection);
  const cart = useCart();
  const flavorA = findFlavor(selection.grandeFlavor);
  const flavorB = selection.grandeFlavorB ? findFlavor(selection.grandeFlavorB) : undefined;
  const allowedFlavorIds = combo.config?.grandeFlavors?.length ? combo.config.grandeFlavors : catalog.combo.options.grandeFlavors;
  const allowedFlavors = catalog.flavors.filter(f => f.active && allowedFlavorIds.includes(f.id));
  const compatibleSecondFlavors = flavorA ? allowedFlavors.filter(f => f.id !== flavorA.id && arePizzaFlavorsCompatible(flavorA, f)) : [];
  const beverageIds = combo.config?.beverages?.length ? combo.config.beverages : catalog.combo.options.beverages;
  const massIds = combo.config?.masses?.length ? combo.config.masses : catalog.masses.map(mass => mass.id);

  useEffect(() => {
    if (!open) return;
    setSelection(current => {
      const grandeFlavor = allowedFlavorIds.includes(current.grandeFlavor) ? current.grandeFlavor : (allowedFlavorIds[0] || current.grandeFlavor);
      const nextFlavorA = findFlavor(grandeFlavor);
      const nextFlavorB = current.grandeFlavorB ? findFlavor(current.grandeFlavorB) : undefined;
      const grandeFlavorB = current.grandeFlavorB && nextFlavorA && nextFlavorB && allowedFlavorIds.includes(current.grandeFlavorB) && current.grandeFlavorB !== grandeFlavor && arePizzaFlavorsCompatible(nextFlavorA, nextFlavorB) ? current.grandeFlavorB : undefined;
      const beverage = beverageIds.includes(current.beverage) ? current.beverage : (beverageIds[0] || current.beverage);
      const mass = massIds.includes(current.mass) ? current.mass : ((massIds[0] || "traditional") as ComboSelection["mass"]);
      const addonPlacements = Object.fromEntries(Object.entries(current.addonPlacements || {}).map(([id, placement]) => [id, placement === "halfB" && !grandeFlavorB ? "whole" : placement]));
      return { ...current, grandeFlavor, grandeFlavorB, beverage, mass, addonPlacements, sweetCutPreference: current.sweetCutPreference === "cut" ? "cut" : "uncut" };
    });
  }, [open, combo.id, allowedFlavorIds.join("|"), beverageIds.join("|"), massIds.join("|")]);

  const total = useMemo(() => { try { return comboTotal(selection, catalog.addons, combo.price, beverageIds); } catch { return 0; } }, [selection, combo.price, beverageIds.join("|")]);

  const changeFirstFlavor = (value: string) => setSelection(current => {
    const nextA = findFlavor(value);
    const currentB = current.grandeFlavorB ? findFlavor(current.grandeFlavorB) : undefined;
    const keepSecond = Boolean(nextA && currentB && arePizzaFlavorsCompatible(nextA, currentB));
    const addonPlacements = keepSecond ? current.addonPlacements : Object.fromEntries(Object.entries(current.addonPlacements || {}).map(([id,p]) => [id,p === "halfB" ? "whole" : p]));
    return { ...current, grandeFlavor: value, grandeFlavorB: keepSecond ? current.grandeFlavorB : undefined, addonPlacements };
  });

  const changeAddon = (id: string, delta: number) => setSelection(s => {
    const current = s.addons[id] || 0;
    const next = Math.max(0, Math.min(2, current + delta));
    const other = Object.entries(s.addons).filter(([k]) => k !== id).reduce((sum, [,q]) => sum + q, 0);
    if (other + next > 5) return s;
    const placements = { ...(s.addonPlacements || {}) };
    if (next > 0 && !placements[id]) placements[id] = "whole";
    if (next === 0) delete placements[id];
    return { ...s, addons: { ...s.addons, [id]: next }, addonPlacements: placements };
  });
  const setPlacement = (id: string, placement: AddonPlacement) => setSelection(s => ({ ...s, addonPlacements: { ...(s.addonPlacements || {}), [id]: placement } }));

  const add = () => {
    if (!total) return;
    const cutLabel = selection.sweetCutPreference === "cut" ? "Broto CORTAR" : "Broto NÃO CORTAR";
    const name = `${combo.name} • ${flavorA?.name || selection.grandeFlavor}${flavorB ? ` / ${flavorB.name}` : ""} • ${cutLabel}`;
    cart.addItem({ id: uid("cart"), kind: "combo", name, quantity: 1, unitPrice: total, image: categoryImages.combo, selection, productId: combo.id });
    onClose();
  };
  return <Modal open={open} onClose={onClose} title="Configure a promoção" className="sm:max-w-3xl">
    <div className="grid md:grid-cols-[280px_1fr]"><div className="relative min-h-56 bg-basso-black"><Image src={categoryImages.combo} alt={combo.name} fill className="object-cover"/></div><div className="space-y-5 p-5">
      <div className="rounded-2xl bg-basso-wine p-4 text-white"><p className="font-display text-xl font-bold">Promoção • R$ 79,99</p><p className="mt-1 text-sm text-white/75">Pizza Grande de Calabresa Tradicional ou Mozzarella + Broto Brigadeiro + Refrigerante 2 L. A Grande pode ser inteira ou meio a meio entre Calabresa e Mozzarella.</p></div>
      <Field title="Massa"><Select value={selection.mass} onChange={v => setSelection(s => ({ ...s, mass: v as ComboSelection["mass"] }))} options={catalog.masses.filter(m => massIds.includes(m.id)).map(m => [m.id,m.name])}/></Field>
      <Field title="1º sabor da Pizza Grande"><Select value={selection.grandeFlavor} onChange={changeFirstFlavor} options={allowedFlavors.map(f => [f.id,f.name])}/></Field>
      <Field title="2º sabor da Pizza Grande (opcional)"><Select value={selection.grandeFlavorB || ""} onChange={v => setSelection(s => ({ ...s, grandeFlavorB: v || undefined, addonPlacements: v ? s.addonPlacements : Object.fromEntries(Object.entries(s.addonPlacements || {}).map(([id,p]) => [id,p === "halfB" ? "whole" : p])) }))} options={[["","Pizza inteira com um sabor"],...compatibleSecondFlavors.map(f => [f.id,f.name])]}/><p className="mt-1 text-xs text-black/45">Na promoção, o meio a meio é feito somente entre Calabresa Tradicional e Mozzarella. O valor base permanece R$ 79,99; adicionais são somados à parte.</p></Field>
      <Field title="Base do Broto Brigadeiro"><Select value={selection.brigadeiroBase} onChange={v => setSelection(s => ({ ...s, brigadeiroBase: v as ComboSelection["brigadeiroBase"] }))} options={[["chocolate-ao-leite","Chocolate ao leite"],["creme-de-avela","Creme de avelã"]]}/></Field>
      <Field title="Corte do Broto Doce"><div className="flex flex-wrap gap-2"><Choice active={selection.sweetCutPreference === "uncut"} onClick={() => setSelection(s => ({ ...s, sweetCutPreference: "uncut" }))}>Não cortar • recomendado</Choice><Choice active={selection.sweetCutPreference === "cut"} onClick={() => setSelection(s => ({ ...s, sweetCutPreference: "cut" }))}>Cortar</Choice></div><p className="mt-1 text-xs text-black/45">O Broto doce vai sem corte por padrão para evitar vazamento do recheio.</p></Field>
      <Field title="Refrigerante 2 L"><Select value={selection.beverage} onChange={v => setSelection(s => ({ ...s, beverage: v }))} options={beverageIds.map(id => [id, findProduct(id)?.name || id])}/></Field>
      <section><div className="flex items-center justify-between"><p className="label mb-0">Adicionais</p><span className="text-xs text-black/45">Máximo 5 unidades</span></div><div className="mt-2 divide-y divide-black/5 rounded-xl border border-black/10 bg-white">{catalog.addons.map(a => { const q = selection.addons[a.id] || 0; const placement = selection.addonPlacements?.[a.id] || "whole"; return <div key={a.id} className="p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{a.name}</p><p className="text-xs text-basso-wine">{currency(a.price)} inteira • {currency(Math.round(a.price/2))} metade</p></div><div className="flex items-center rounded-lg border border-black/10"><button type="button" className="p-2" onClick={() => changeAddon(a.id,-1)} disabled={!q}><Minus size={15}/></button><span className="w-7 text-center text-xs font-bold">{q}</span><button type="button" className="p-2" onClick={() => changeAddon(a.id,1)} disabled={q>=2 || Object.values(selection.addons).reduce((x,y)=>x+y,0)>=5}><Plus size={15}/></button></div></div>{q>0&&<div className="mt-2 flex flex-wrap gap-1"><Choice active={placement==="whole"} onClick={()=>setPlacement(a.id,"whole")}>Pizza inteira</Choice><Choice active={placement==="halfA"} onClick={()=>setPlacement(a.id,"halfA")}>Metade {flavorA?.name||"1"}</Choice>{flavorB&&<Choice active={placement==="halfB"} onClick={()=>setPlacement(a.id,"halfB")}>Metade {flavorB.name}</Choice>}</div>}</div>; })}</div></section>
      <Field title="Observações"><textarea className="textarea" value={selection.notes} maxLength={500} onChange={e => setSelection(s => ({ ...s, notes: e.target.value }))}/></Field>
      <button type="button" className="btn-primary w-full py-3.5" onClick={add} disabled={!total}><ShoppingBag size={18}/> Adicionar • {currency(total)}</button>
    </div></div>
  </Modal>;
}
function Field({ title, children }: { title: string; children: React.ReactNode }) { return <label className="block"><span className="label">{title}</span>{children}</label>; }
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[][] }) { return <select className="input" value={value} onChange={e => onChange(e.target.value)}>{options.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>; }
function Choice({active,onClick,children}:{active:boolean;onClick:()=>void;children:React.ReactNode}){return <button type="button" className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${active?"border-basso-wine bg-basso-wine/5 text-basso-wine":"border-black/10"}`} onClick={onClick}>{children}</button>}