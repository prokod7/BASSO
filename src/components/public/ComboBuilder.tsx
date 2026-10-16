"use client";
import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { catalog, categoryImages } from "@/lib/catalog";
import {
  comboConfig,
  priceConfiguredCombo,
  type ComboConfig,
} from "@/lib/combos";
import { currency, uid } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import { Modal } from "@/components/ui/Modal";
import type { CartItem, ComboSelection, Product } from "@/types";

export interface ComboOffer {
  id: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  config?: Partial<ComboConfig>;
}
export function ComboBuilder({
  open,
  onClose,
  combo = catalog.combo as ComboOffer,
  products = [],
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  combo?: ComboOffer;
  products?: Product[];
  onAdd?: (item: CartItem) => void;
}) {
  const cart = useCart();
  const config = comboConfig({
    grandeFlavors: catalog.combo.options.grandeFlavors,
    beverages: catalog.combo.options.beverages,
    sweetFlavor: catalog.combo.options.sweetFlavor,
    ...combo.config,
  });
  const savory = catalog.flavors.filter(
    (f) =>
      f.active && f.category !== "sweet" && config.grandeFlavors.includes(f.id),
  );
  const sweets = catalog.flavors.filter(
    (f) =>
      f.active &&
      f.category === "sweet" &&
      (config.sweetFlavors || [config.sweetFlavor]).includes(f.id),
  );
  const beverages = products.length
    ? products.filter((p) => p.active && config.beverages.includes(p.id))
    : [...catalog.beverages].filter(
        (p) => p.active && config.beverages.includes(p.id),
      );
  const [selection, setSelection] = useState<ComboSelection>({
    mass: "traditional",
    grandeFlavor: "",
    brigadeiroBase: "chocolate-ao-leite",
    beverage: "",
    addons: {},
    notes: "",
  });
  useEffect(() => {
    if (open)
      setSelection({
        mass: config.masses[0],
        grandeFlavor: savory[0]?.id || "",
        secondGrandeFlavor:
          config.grandeQuantity === 2 ? savory[0]?.id : undefined,
        sweetFlavor: sweets[0]?.id,
        sweetSize: config.sweetSize,
        sweetCutPreference: "uncut",
        brigadeiroBase: "chocolate-ao-leite",
        beverage: beverages[0]?.id || "",
        addons: {},
        notes: "",
      });
  }, [open, combo.id]);
  let priced: ReturnType<typeof priceConfiguredCombo> | null = null;
  try {
    priced = priceConfiguredCombo(
      selection,
      config,
      combo.price,
      catalog.flavors,
      catalog.addons,
    );
  } catch {}
  function update<K extends keyof ComboSelection>(
    key: K,
    value: ComboSelection[K],
  ) {
    setSelection((s) => ({ ...s, [key]: value }));
  }
  function add() {
    if (!priced) return;
    const beverage = beverages.find((p) => p.id === selection.beverage);
    const item: CartItem = {
      id: uid("cart"),
      kind: "combo",
      productId: combo.id,
      name: `${combo.name} • ${priced.details} • ${beverage?.name || ""}`,
      unitPrice: priced.total,
      quantity: 1,
      image: combo.image || categoryImages.combo,
      selection,
    };
    if (onAdd) onAdd(item);
    else cart.addItem(item);
    onClose();
  }
  const pizza = (second: boolean) => {
    const a = second ? "secondGrandeFlavor" : "grandeFlavor";
    const b = second ? "secondGrandeFlavorB" : "grandeFlavorB";
    return (
      <fieldset className="space-y-3 rounded-2xl border p-4">
        <legend className="px-2 font-bold">
          Pizza Grande {second ? 2 : 1}
        </legend>
        <Select
          label="1º sabor"
          value={selection[a] || ""}
          onChange={(v) =>
            setSelection((s) => ({
              ...s,
              [a]: v,
              [b]: undefined,
              ...(!second ? { addonPlacements: {} } : {}),
            }))
          }
          options={savory.map((f) => [f.id, f.name])}
        />
        {config.allowHalfHalf && (
          <Select
            label="2º sabor (opcional)"
            value={selection[b] || ""}
            onChange={(v) =>
              setSelection((s) => ({
                ...s,
                [b]: v || undefined,
                ...(!second ? { addonPlacements: {} } : {}),
              }))
            }
            options={[
              ["", "Inteira com um sabor"],
              ...savory
                .filter((f) => f.id !== selection[a])
                .map((f) => [f.id, f.name]),
            ]}
          />
        )}
      </fieldset>
    );
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={combo.name}
      className="sm:max-w-2xl"
    >
      <div className="space-y-5 p-4 sm:p-6">
        <div className="rounded-2xl bg-basso-wine p-4 text-white">
          <p className="text-xl font-bold">{currency(combo.price)}</p>
          <p className="mt-1 text-sm">{combo.description}</p>
        </div>
        <Select
          label="Massa"
          value={selection.mass}
          onChange={(v) => update("mass", v as ComboSelection["mass"])}
          options={config.masses.map((id) => [
            id,
            id === "integral" ? "Integral" : "Tradicional",
          ])}
        />
        {pizza(false)}
        {config.grandeQuantity === 2 && pizza(true)}
        <Select
          label={`Pizza doce ${config.sweetSize === "broto" ? "Broto" : "Grande"} • um sabor`}
          value={selection.sweetFlavor || ""}
          onChange={(v) => update("sweetFlavor", v)}
          options={sweets.map((f) => [f.id, f.name])}
        />
        {selection.sweetFlavor === "brigadeiro" && (
          <Select
            label="Base do Brigadeiro"
            value={selection.brigadeiroBase}
            onChange={(v) =>
              update("brigadeiroBase", v as ComboSelection["brigadeiroBase"])
            }
            options={[
              ["chocolate-ao-leite", "Chocolate ao leite"],
              ["creme-de-avela", "Creme de avelã"],
            ]}
          />
        )}
        <Select
          label="Corte da pizza doce"
          value={selection.sweetCutPreference || "uncut"}
          onChange={(v) => update("sweetCutPreference", v as "cut" | "uncut")}
          options={[
            ["uncut", "Não cortar (recomendado)"],
            ["cut", "Cortar"],
          ]}
        />
        <Select
          label="Refrigerante incluso"
          value={selection.beverage}
          onChange={(v) => update("beverage", v)}
          options={beverages.map((p) => [p.id, p.name])}
        />
        <details className="group rounded-2xl border border-black/10 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold">
            Adicionais opcionais <span className="font-normal text-black/50">· {Object.values(selection.addons).reduce((sum, n) => sum + n, 0)}/5</span>
          </summary>
          <div className="border-t border-black/5 px-4 pb-3">
            <p className="py-3 text-xs text-black/50">Na primeira pizza salgada. Até 5 unidades, no máximo 2 de cada.</p>
            <div className="divide-y divide-black/5">
              {catalog.addons.filter((a) => a.active).map((a) => {
                const quantity = selection.addons[a.id] || 0;
                const count = Object.values(selection.addons).reduce((sum, n) => sum + n, 0);
                const max = Math.min(2, a.maxQuantity ?? 2);
                const change = (delta: number) => setSelection((current) => {
                  const next = (current.addons[a.id] || 0) + delta;
                  const total = Object.values(current.addons).reduce((sum, n) => sum + n, 0);
                  if (next < 0 || next > max || total + delta > 5) return current;
                  const addons = { ...current.addons };
                  const addonPlacements = { ...current.addonPlacements };
                  if (next) addons[a.id] = next;
                  else { delete addons[a.id]; delete addonPlacements[a.id]; }
                  return { ...current, addons, addonPlacements };
                });
                return <div key={a.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0"><p className="text-sm font-medium leading-snug">{a.name}</p><p className="mt-0.5 text-xs text-black/50">+ {currency(a.price)}</p></div>
                    <div className="flex shrink-0 items-center gap-1 rounded-full border border-black/10 p-0.5">
                      <button type="button" aria-label={`Remover ${a.name}`} disabled={!quantity} onClick={() => change(-1)} className="grid h-10 w-10 place-items-center rounded-full disabled:opacity-25"><Minus size={16}/></button>
                      <span aria-live="polite" className="w-5 text-center text-sm font-bold tabular-nums">{quantity}</span>
                      <button type="button" aria-label={`Adicionar ${a.name}`} disabled={quantity >= max || count >= 5} onClick={() => change(1)} className="grid h-10 w-10 place-items-center rounded-full bg-basso-wine text-white disabled:opacity-25"><Plus size={16}/></button>
                    </div>
                  </div>
                  {quantity > 0 && <fieldset className="mt-2"><legend className="sr-only">Local de {a.name}</legend><div className="flex flex-wrap gap-1.5">{([['whole', 'Inteira'], ...(selection.grandeFlavorB ? [['halfA', 'Metade 1'], ['halfB', 'Metade 2']] : [])] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={(selection.addonPlacements?.[a.id] || 'whole') === value} onClick={() => setSelection(current => ({...current, addonPlacements: {...current.addonPlacements, [a.id]: value as 'whole' | 'halfA' | 'halfB'}}))} className={`min-h-10 rounded-full border px-3 text-xs font-medium ${(selection.addonPlacements?.[a.id] || 'whole') === value ? 'border-basso-wine bg-basso-wine/5 text-basso-wine' : 'border-black/10 text-black/60'}`}>{label}</button>)}</div></fieldset>}
                </div>;
              })}
            </div>
          </div>
        </details>
        <label className="block">
          <span className="label">Observações</span>
          <textarea
            className="textarea"
            maxLength={500}
            value={selection.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </label>
        {!priced && (
          <p role="status" className="text-sm text-amber-800">
            Confira sabores, bebida e limite de adicionais. Pode haver um
            componente indisponível.
          </p>
        )}
        <button
          type="button"
          className="btn-primary min-h-12 w-full"
          disabled={!priced}
          onClick={add}
        >
          Adicionar combo • {currency(priced?.total || combo.price)}
        </button>
      </div>
    </Modal>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select
        className="input min-h-12"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!options.length && <option value="">Indisponível</option>}
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
