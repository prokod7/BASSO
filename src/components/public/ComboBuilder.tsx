"use client";
import { useEffect, useState } from "react";
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
        <details className="rounded-2xl border p-4">
          <summary className="cursor-pointer font-bold">
            Adicionais na primeira pizza salgada
          </summary>
          <p className="mt-2 text-xs text-black/50">
            Até 5 unidades, no máximo 2 de cada. Cobrados à parte.
          </p>
          <div className="mt-3 space-y-3">
            {catalog.addons
              .filter((a) => a.active)
              .map((a) => (
                <div key={a.id} className="grid grid-cols-[1fr_70px] gap-2">
                  <label className="text-sm">
                    {a.name} • {currency(a.price)}
                    <input
                      aria-label={`Quantidade de ${a.name}`}
                      className="input mt-1"
                      type="number"
                      min={0}
                      max={2}
                      value={selection.addons[a.id] || 0}
                      onChange={(e) =>
                        setSelection((s) => ({
                          ...s,
                          addons: {
                            ...s.addons,
                            [a.id]: Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                  {Boolean(selection.addons[a.id]) && (
                    <select
                      aria-label={`Local de ${a.name}`}
                      className="input self-end"
                      value={selection.addonPlacements?.[a.id] || "whole"}
                      onChange={(e) =>
                        setSelection((s) => ({
                          ...s,
                          addonPlacements: {
                            ...s.addonPlacements,
                            [a.id]: e.target.value as
                              | "whole"
                              | "halfA"
                              | "halfB",
                          },
                        }))
                      }
                    >
                      <option value="whole">Inteira</option>
                      <option value="halfA">Metade 1</option>
                      {selection.grandeFlavorB && (
                        <option value="halfB">Metade 2</option>
                      )}
                    </select>
                  )}
                </div>
              ))}
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
