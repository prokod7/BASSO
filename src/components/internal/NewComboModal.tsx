"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { currency } from "@/lib/utils";

interface FlavorOption { id: string; name: string; active: boolean }
interface ProductOption { id: string; name: string; category: string; active: boolean }

const dayOptions = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

export function NewComboModal({
  open,
  flavors,
  products,
  onClose,
  onCreated,
}: {
  open: boolean;
  flavors: FlavorOption[];
  products: ProductOption[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const activeFlavors = useMemo(() => flavors.filter(flavor => flavor.active), [flavors]);
  const twoLiterBeverages = useMemo(
    () => products.filter(product => product.active && product.category === "beverages" && /(?:2\s*l|2l)/i.test(product.name)),
    [products],
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(7999);
  const [days, setDays] = useState<number[]>([0, 2, 3, 4, 5, 6]);
  const [flavorIds, setFlavorIds] = useState<string[]>([]);
  const [beverageIds, setBeverageIds] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  if (!open) return null;

  const effectiveFlavors = flavorIds.length ? flavorIds : activeFlavors.map(item => item.id);
  const effectiveBeverages = beverageIds.length ? beverageIds : twoLiterBeverages.map(item => item.id);

  function toggle<T extends string | number>(list: T[], value: T, setter: (next: T[]) => void) {
    setter(list.includes(value) ? list.filter(item => item !== value) : [...list, value]);
  }

  async function create() {
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch("/api/menu/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          price,
          days,
          grandeFlavors: effectiveFlavors,
          beverages: effectiveBeverages,
          sweetFlavor: "brigadeiro",
          active: true,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao criar combo.");
      await onCreated();
      setName("");
      setDescription("");
      setFlavorIds([]);
      setBeverageIds([]);
      setMessage("");
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar combo.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-black/60 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-basso-wine">Novo combo</p>
            <h2 className="mt-1 font-display text-2xl font-bold">Grande + Broto Brigadeiro + bebida</h2>
            <p className="mt-1 text-sm text-black/50">Este modelo já aceita pizza Grande inteira ou meio a meio e adicionais na pizza inteira ou em uma metade.</p>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>

        {message && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</p>}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label><span className="label">Nome</span><input className="input" value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Combo Quarta Basso" /></label>
          <label><span className="label">Preço</span><input className="input" value={(price / 100).toFixed(2).replace(".", ",")} onChange={event => setPrice(Math.max(0, Math.round((Number(event.target.value.replace(",", ".")) || 0) * 100)))} /></label>
          <label className="sm:col-span-2"><span className="label">Descrição</span><textarea className="textarea" value={description} onChange={event => setDescription(event.target.value)} placeholder="Explique o que o combo inclui." /></label>
        </div>

        <section className="mt-5">
          <p className="label">Dias em que o combo aparece</p>
          <div className="flex flex-wrap gap-2">{dayOptions.map(day => <label key={day.value} className={`rounded-xl border px-3 py-2 text-sm font-bold ${days.includes(day.value) ? "border-basso-wine bg-basso-wine/5 text-basso-wine" : "border-black/10 text-black/45"}`}><input className="mr-2" type="checkbox" checked={days.includes(day.value)} onChange={() => toggle(days, day.value, setDays)} />{day.label}</label>)}</div>
        </section>

        <section className="mt-5">
          <div className="flex items-center justify-between gap-3"><p className="label mb-0">Sabores permitidos na Grande</p><span className="text-xs text-black/45">{effectiveFlavors.length} selecionados</span></div>
          <div className="mt-2 grid max-h-52 gap-2 overflow-y-auto rounded-2xl border p-3 sm:grid-cols-2 lg:grid-cols-3">{activeFlavors.map(flavor => <label key={flavor.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={effectiveFlavors.includes(flavor.id)} onChange={() => { const base = flavorIds.length ? flavorIds : activeFlavors.map(item => item.id); toggle(base, flavor.id, setFlavorIds); }} />{flavor.name}</label>)}</div>
        </section>

        <section className="mt-5">
          <p className="label">Bebidas permitidas</p>
          <div className="grid gap-2 rounded-2xl border p-3 sm:grid-cols-2">{twoLiterBeverages.map(product => <label key={product.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={effectiveBeverages.includes(product.id)} onChange={() => { const base = beverageIds.length ? beverageIds : twoLiterBeverages.map(item => item.id); toggle(base, product.id, setBeverageIds); }} />{product.name}</label>)}</div>
        </section>

        <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl bg-basso-paper p-4">
          <div><p className="text-xs font-bold uppercase text-black/40">Preço do combo</p><strong className="text-xl text-basso-wine">{currency(price)}</strong></div>
          <button className="btn-primary" disabled={working || name.trim().length < 2 || description.trim().length < 2 || !days.length || !effectiveFlavors.length || !effectiveBeverages.length} onClick={create}>{working ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />}Criar combo</button>
        </div>
      </div>
    </div>
  );
}
