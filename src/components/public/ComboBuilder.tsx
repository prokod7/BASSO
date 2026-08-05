"use client";
import Image from "next/image";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { catalog, categoryImages, findProduct } from "@/lib/catalog";
import { comboTotal } from "@/lib/pricing";
import { currency, uid } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import { Modal } from "@/components/ui/Modal";
import type { ComboSelection } from "@/types";

const defaultSelection: ComboSelection = { mass: "traditional", grandeFlavor: "calabresa-tradicional", brigadeiroBase: "chocolate-ao-leite", beverage: "guarana-antarctica-2-l", addons: {}, notes: "" };
export function ComboBuilder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selection, setSelection] = useState<ComboSelection>(defaultSelection);
  const cart = useCart();
  const total = useMemo(() => comboTotal(selection), [selection]);
  const changeAddon = (id: string, delta: number) => setSelection(s => {
    const current = s.addons[id] || 0;
    const next = Math.max(0, Math.min(2, current + delta));
    const other = Object.entries(s.addons).filter(([k]) => k !== id).reduce((sum, [,q]) => sum + q, 0);
    if (other + next > 5) return s;
    return { ...s, addons: { ...s.addons, [id]: next } };
  });
  const add = () => {
    cart.addItem({ id: uid("cart"), kind: "combo", name: catalog.combo.name, quantity: 1, unitPrice: total, image: categoryImages.combo, selection });
    onClose();
  };
  return <Modal open={open} onClose={onClose} title="Configure o combo" className="sm:max-w-3xl">
    <div className="grid md:grid-cols-[280px_1fr]"><div className="relative min-h-56 bg-basso-black"><Image src={categoryImages.combo} alt={catalog.combo.name} fill className="object-cover"/></div><div className="space-y-5 p-5">
      <div className="rounded-2xl bg-basso-wine p-4 text-white"><p className="font-display text-xl font-bold">{catalog.combo.name}</p><p className="mt-1 text-sm text-white/75">Massa, pizza Grande, Broto Brigadeiro e refrigerante 2 L.</p></div>
      <Field title="Massa"><Select value={selection.mass} onChange={v => setSelection(s => ({ ...s, mass: v as ComboSelection["mass"] }))} options={catalog.masses.map(m => [m.id,m.name])}/></Field>
      <Field title="Pizza Grande"><Select value={selection.grandeFlavor} onChange={v => setSelection(s => ({ ...s, grandeFlavor: v as ComboSelection["grandeFlavor"] }))} options={[["calabresa-tradicional","Calabresa Tradicional"],["mozzarella","Mozzarella"]]}/></Field>
      <Field title="Base do Broto Brigadeiro"><Select value={selection.brigadeiroBase} onChange={v => setSelection(s => ({ ...s, brigadeiroBase: v as ComboSelection["brigadeiroBase"] }))} options={[["chocolate-ao-leite","Chocolate ao leite"],["creme-de-avela","Creme de avelã"]]}/></Field>
      <Field title="Refrigerante 2 L"><Select value={selection.beverage} onChange={v => setSelection(s => ({ ...s, beverage: v }))} options={catalog.combo.options.beverages.map(id => [id, findProduct(id)?.name || id])}/></Field>
      <section><div className="flex items-center justify-between"><p className="label mb-0">Adicionais</p><span className="text-xs text-black/45">Máximo 5 unidades</span></div><div className="mt-2 divide-y divide-black/5 rounded-xl border border-black/10 bg-white">{catalog.addons.map(a => { const q = selection.addons[a.id] || 0; return <div key={a.id} className="flex items-center justify-between p-3"><div><p className="text-sm font-semibold">{a.name}</p><p className="text-xs text-basso-wine">{currency(a.price)}</p></div><div className="flex items-center rounded-lg border border-black/10"><button className="p-2" onClick={() => changeAddon(a.id,-1)} disabled={!q}><Minus size={15}/></button><span className="w-7 text-center text-xs font-bold">{q}</span><button className="p-2" onClick={() => changeAddon(a.id,1)} disabled={q>=2 || Object.values(selection.addons).reduce((x,y)=>x+y,0)>=5}><Plus size={15}/></button></div></div>; })}</div></section>
      <Field title="Observações"><textarea className="textarea" value={selection.notes} maxLength={500} onChange={e => setSelection(s => ({ ...s, notes: e.target.value }))}/></Field>
      <button className="btn-primary w-full py-3.5" onClick={add}><ShoppingBag size={18}/> Adicionar • {currency(total)}</button>
    </div></div>
  </Modal>;
}
function Field({ title, children }: { title: string; children: React.ReactNode }) { return <label className="block"><span className="label">{title}</span>{children}</label>; }
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[][] }) { return <select className="input" value={value} onChange={e => onChange(e.target.value)}>{options.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>; }
