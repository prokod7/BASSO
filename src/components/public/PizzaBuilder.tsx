"use client";

import Image from "next/image";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Heart, Minus, Plus, Search, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { catalog, categoryImages, findFlavor } from "@/lib/catalog";
import { arePizzaFlavorsCompatible, pizzaTotal, validatePizzaSelection } from "@/lib/pricing";
import type { CartItem, Flavor, PizzaSelection } from "@/types";
import { currency, normalizeSearchText, uid } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import { Modal } from "@/components/ui/Modal";
import { customerDeviceActions, useCustomerDeviceState } from "@/lib/customer-device-store";

export type PizzaMenuScope = Flavor["category"] | "featured";
type FlavorSlot = "A" | "B";
type FlavorCategoryFilter = Flavor["category"] | "all";

export interface PizzaMenuEntry {
  scope: PizzaMenuScope;
  size: PizzaSelection["size"];
}

const scopeLabels: Record<PizzaMenuScope, string> = {
  featured: "Mais pedidas",
  traditional: "Pizzas Tradicionais",
  premium: "Pizzas Premium",
  sweet: "Pizzas Doces",
};

const flavorCategoryLabels: Record<Flavor["category"], string> = {
  traditional: "Tradicional",
  premium: "Premium",
  sweet: "Doce",
};

export function flavorsForEntry(entry: PizzaMenuEntry): Flavor[] {
  return catalog.flavors.filter((flavor) => {
    if (!flavor.active) return false;
    return entry.scope === "featured" ? flavor.featured : flavor.category === entry.scope;
  });
}

function imageForEntry(entry: PizzaMenuEntry) {
  if (entry.scope === "featured") return categoryImages.featured[entry.size];
  return categoryImages[entry.scope][entry.size];
}

function minimumForEntry(entry: PizzaMenuEntry) {
  const prices = flavorsForEntry(entry).map((flavor) =>
    entry.size === "grande" ? flavor.priceGrande : flavor.priceBroto,
  );
  return prices.length ? Math.min(...prices) : 0;
}

function normalizePlacementsWithoutSecondHalf(
  placements: PizzaSelection["addonPlacements"],
): PizzaSelection["addonPlacements"] {
  return Object.fromEntries(
    Object.entries(placements || {}).map(([id, placement]) => [
      id,
      placement === "halfB" ? "whole" : placement,
    ]),
  ) as PizzaSelection["addonPlacements"];
}

export function PizzaMenuCard({
  entry,
  onOpen,
  resultCount,
}: {
  entry: PizzaMenuEntry;
  onOpen: (entry: PizzaMenuEntry) => void;
  resultCount?: number;
}) {
  const sizeLabel = entry.size === "grande" ? "Grande" : "Broto";
  const subtitle = entry.size === "grande" ? "1 sabor ou meio a meio" : "1 sabor";

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="surface group grid min-h-[126px] w-full grid-cols-[1fr_104px] overflow-hidden text-left transition active:scale-[.995] sm:min-h-[154px] sm:grid-cols-[1fr_138px] sm:hover:-translate-y-0.5 sm:hover:border-basso-gold sm:hover:shadow-premium"
      aria-label={`Abrir ${scopeLabels[entry.scope]} tamanho ${sizeLabel}`}
    >
      <div className="flex min-w-0 flex-col p-4 sm:p-5">
        <span className="text-[9px] font-black uppercase tracking-[.14em] text-basso-gold sm:text-[10px]">
          {scopeLabels[entry.scope]}
        </span>
        <h3 className="mt-1 font-display text-xl font-bold sm:mt-2 sm:text-2xl">Pizza {sizeLabel}</h3>
        <p className="mt-1 text-xs font-semibold text-black/45">{subtitle}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          <div>
            <span className="text-[9px] uppercase tracking-wide text-black/35">A partir de</span>
            <strong className="block text-base text-basso-wine sm:text-lg">{currency(minimumForEntry(entry))}</strong>
          </div>
          {typeof resultCount === "number" && (
            <span className="rounded-full bg-basso-paper px-2 py-1 text-[9px] font-bold text-black/45">{resultCount} sabores</span>
          )}
        </div>
      </div>
      <div className="relative min-h-full overflow-hidden bg-basso-black">
        <Image src={imageForEntry(entry)} alt={`${scopeLabels[entry.scope]} ${sizeLabel}`} fill sizes="(max-width: 640px) 104px, 138px" className="object-cover transition duration-500 sm:group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-black/10" />
        <span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-basso-wine text-white shadow-lg"><Plus size={18} /></span>
      </div>
    </button>
  );
}

export function PizzaCard({ flavor, onOpen }: { flavor: Flavor; onOpen: (f: Flavor) => void }) {
  const min = Math.min(flavor.priceGrande, flavor.priceBroto);
  const ref = `flavor:${flavor.id}`;
  const favorite = useCustomerDeviceState((state) => state.favorites.includes(ref));

  return (
    <article className="surface group relative flex min-h-[148px] overflow-hidden transition sm:min-h-[168px] sm:hover:-translate-y-0.5 sm:hover:shadow-premium">
      <button type="button" className={`absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full ${favorite ? "bg-red-50 text-red-600" : "bg-black/5 text-black/35"}`} onClick={() => customerDeviceActions.toggleFavorite(ref)} aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
        <Heart size={16} fill={favorite ? "currentColor" : "none"} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-center gap-2 pr-10">
          <h3 className="font-display text-lg font-bold leading-tight">{flavor.name}</h3>
          {flavor.featured && <span className="rounded-full bg-basso-gold/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-basso-wine">Mais pedida</span>}
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-black/50">{flavor.description}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div><span className="text-[9px] uppercase tracking-wide text-black/35">A partir de</span><strong className="block text-base text-basso-wine">{currency(min)}</strong></div>
          <button type="button" className="grid h-11 w-11 place-items-center rounded-full bg-basso-wine text-white transition active:scale-95" onClick={() => onOpen(flavor)} aria-label={`Montar pizza ${flavor.name}`}><Plus size={19} /></button>
        </div>
      </div>
    </article>
  );
}

const initial = (flavorId: string, size: PizzaSelection["size"] = "grande"): PizzaSelection => ({
  size,
  mass: "traditional",
  flavorA: flavorId,
  removedA: [],
  removedB: [],
  addons: {},
  notes: "",
});

export function PizzaBuilder({
  flavor = null,
  entry = null,
  open,
  onClose,
  onAdd,
  initialSelection = null,
}: {
  flavor?: Flavor | null;
  entry?: PizzaMenuEntry | null;
  open: boolean;
  onClose: () => void;
  onAdd?: (item: CartItem) => void;
  initialSelection?: PizzaSelection | null;
}) {
  const cart = useCart();
  const entryFlavors = useMemo(() => (entry ? flavorsForEntry(entry) : []), [entry]);
  const seedFlavor = flavor || entryFlavors[0] || catalog.flavors.find((item) => item.active) || catalog.flavors[0];
  const [selection, setSelection] = useState<PizzaSelection>(() => initial(seedFlavor.id, entry?.size || "grande"));
  const [error, setError] = useState("");
  const [flavorPicker, setFlavorPicker] = useState<FlavorSlot | null>(null);
  const [flavorQuery, setFlavorQuery] = useState("");
  const [flavorCategory, setFlavorCategory] = useState<FlavorCategoryFilter>("all");

  const currentA = findFlavor(selection.flavorA) || seedFlavor;
  const currentB = selection.flavorB ? findFlavor(selection.flavorB) : undefined;
  const isHalfHalf = Boolean(currentB);
  const removedCount = selection.removedA.length + selection.removedB.length;
  const addonUnits = Object.values(selection.addons).reduce((sum, value) => sum + value, 0);

  const flavorPickerBase = useMemo(() => {
    const active = catalog.flavors.filter((item) => item.active);
    if (!flavorPicker) return [];
    if (flavorPicker === "B") return active.filter((item) => item.id !== currentA.id && arePizzaFlavorsCompatible(currentA, item));
    return active;
  }, [flavorPicker, currentA]);

  const flavorPickerResults = useMemo(() => {
    const normalized = normalizeSearchText(flavorQuery);
    return flavorPickerBase.filter((item) => {
      if (flavorCategory !== "all" && item.category !== flavorCategory) return false;
      if (!normalized) return true;
      return normalizeSearchText(`${item.name} ${item.description} ${item.ingredients.join(" ")}`).includes(normalized);
    });
  }, [flavorPickerBase, flavorCategory, flavorQuery]);

  const availablePickerCategories = useMemo(
    () => (["traditional", "premium", "sweet"] as Flavor["category"][]).filter((category) => flavorPickerBase.some((item) => item.category === category)),
    [flavorPickerBase],
  );

  const total = useMemo(() => {
    try { return pizzaTotal(selection); } catch { return 0; }
  }, [selection]);

  const resetFor = (nextFlavor: Flavor, size: PizzaSelection["size"]) => {
    setSelection(initial(nextFlavor.id, size));
    setFlavorPicker(null);
    setFlavorQuery("");
    setFlavorCategory("all");
    setError("");
  };

  const modalKey = `${flavor?.id || ""}:${entry?.scope || ""}:${entry?.size || ""}`;
  useEffect(() => {
    if (!open) return;
    if (initialSelection) {
      setSelection({
        ...initialSelection,
        removedA: [...initialSelection.removedA],
        removedB: [...initialSelection.removedB],
        addons: { ...initialSelection.addons },
        addonPlacements: { ...(initialSelection.addonPlacements || {}) },
      });
      setFlavorPicker(null);
      setFlavorQuery("");
      setFlavorCategory("all");
      setError("");
      return;
    }
    const nextFlavor = flavor || entryFlavors[0] || catalog.flavors.find((item) => item.active);
    if (nextFlavor) resetFor(nextFlavor, entry?.size || "grande");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalKey, open, initialSelection]);

  const openFlavorPicker = (slot: FlavorSlot) => {
    setFlavorQuery("");
    if (slot === "A" && entry && entry.scope !== "featured") setFlavorCategory(entry.scope);
    else setFlavorCategory("all");
    setFlavorPicker(slot);
  };

  const chooseFlavor = (slot: FlavorSlot, nextFlavor: Flavor) => {
    setSelection((current) => {
      if (slot === "B") {
        const a = findFlavor(current.flavorA) || currentA;
        if (!arePizzaFlavorsCompatible(a, nextFlavor) || a.id === nextFlavor.id) return current;
        return { ...current, flavorB: nextFlavor.id, removedB: [] };
      }
      const previousB = current.flavorB ? findFlavor(current.flavorB) : undefined;
      const keepSecond = Boolean(previousB && previousB.id !== nextFlavor.id && arePizzaFlavorsCompatible(nextFlavor, previousB));
      return {
        ...current,
        flavorA: nextFlavor.id,
        flavorB: keepSecond ? current.flavorB : undefined,
        removedA: [],
        removedB: keepSecond ? current.removedB : [],
        addonPlacements: keepSecond ? current.addonPlacements : normalizePlacementsWithoutSecondHalf(current.addonPlacements),
      };
    });
    setError("");
    setFlavorPicker(null);
    setFlavorQuery("");
    setFlavorCategory("all");
  };

  const useWholePizza = () => {
    setSelection((current) => ({
      ...current,
      flavorB: undefined,
      removedB: [],
      addonPlacements: normalizePlacementsWithoutSecondHalf(current.addonPlacements),
    }));
    setError("");
  };

  const startHalfHalf = () => {
    if (selection.size !== "grande") return;
    if (currentB) return;
    openFlavorPicker("B");
  };

  const changeSize = (size: PizzaSelection["size"]) => setSelection((current) => ({
    ...current,
    size,
    flavorB: size === "broto" ? undefined : current.flavorB,
    removedB: size === "broto" ? [] : current.removedB,
    addonPlacements: size === "broto" ? normalizePlacementsWithoutSecondHalf(current.addonPlacements) : current.addonPlacements,
  }));

  const toggleRemoved = (half: "A" | "B", ingredient: string) =>
    setSelection((current) => {
      const key = half === "A" ? "removedA" : "removedB";
      const list = current[key];
      return { ...current, [key]: list.includes(ingredient) ? list.filter((item) => item !== ingredient) : [...list, ingredient] };
    });

  const setAddon = (id: string, delta: number) =>
    setSelection((current) => {
      const quantity = current.addons[id] || 0;
      const next = Math.max(0, Math.min(2, quantity + delta));
      const sumWithout = Object.entries(current.addons).filter(([key]) => key !== id).reduce((sum, [, value]) => sum + value, 0);
      if (sumWithout + next > 5) return current;
      const placements = { ...(current.addonPlacements || {}) };
      if (next > 0 && !placements[id]) placements[id] = "whole";
      if (next === 0) delete placements[id];
      return { ...current, addons: { ...current.addons, [id]: next }, addonPlacements: placements };
    });

  const setAddonPlacement = (id: string, placement: "whole" | "halfA" | "halfB") =>
    setSelection((current) => ({ ...current, addonPlacements: { ...(current.addonPlacements || {}), [id]: placement } }));

  const add = () => {
    try {
      validatePizzaSelection(selection);
      const a = findFlavor(selection.flavorA)!;
      const b = selection.flavorB ? findFlavor(selection.flavorB) : undefined;
      const name = `Pizza ${selection.size === "grande" ? "Grande" : "Broto"} • ${a.name}${b ? ` / ${b.name}` : ""}`;
      const item: CartItem = {
        id: uid("cart"),
        kind: "pizza",
        name,
        quantity: 1,
        unitPrice: pizzaTotal(selection),
        image: entry ? imageForEntry(entry) : categoryImages[a.category][selection.size],
        selection,
      };
      if (onAdd) onAdd(item); else cart.addItem(item);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar a pizza.");
    }
  };

  if (!flavor && !entry) return null;

  const sizeLabel = selection.size === "grande" ? "Grande" : "Broto";
  const scopeLabel = entry ? scopeLabels[entry.scope] : "Pizza artesanal";
  const builderImage = entry ? imageForEntry(entry) : categoryImages[currentA.category][selection.size];

  return (
    <Modal open={open} onClose={onClose} title={initialSelection ? "Editar pizza" : "Monte sua pizza"} className="sm:max-w-4xl">
      <div className="md:grid md:grid-cols-[250px_1fr]">
        <aside className="relative hidden min-h-full bg-basso-black md:block">
          <Image src={builderImage} alt={`${scopeLabel} ${sizeLabel}`} fill className="object-cover opacity-85" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
          <div className="absolute bottom-0 p-5 text-white">
            <p className="text-xs uppercase tracking-[.2em] text-basso-goldLight">{scopeLabel}</p>
            <h3 className="mt-1 font-display text-2xl font-bold">{currentA.name}{currentB ? ` + ${currentB.name}` : ""}</h3>
          </div>
        </aside>

        <div className="px-4 pb-0 pt-3 sm:p-5 sm:pb-0">
          <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none md:hidden">
            <span className="shrink-0 rounded-full bg-basso-wine px-3 py-2 text-xs font-bold text-white">{sizeLabel}</span>
            <span className="shrink-0 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/55">{scopeLabel}</span>
            <span className="shrink-0 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/55">{isHalfHalf ? "Meio a meio" : "1 sabor"}</span>
          </div>

          <section className="rounded-2xl border border-black/5 bg-white p-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <ControlGroup label="Tamanho">
                {entry ? (
                  <div className="flex min-h-12 items-center rounded-xl bg-basso-wine/[.055] px-4 text-sm font-black text-basso-wine ring-1 ring-basso-wine/15">{sizeLabel}</div>
                ) : (
                  <SegmentedControl options={[{ id: "grande", label: "Grande" }, { id: "broto", label: "Broto" }]} value={selection.size} onChange={(value) => changeSize(value as PizzaSelection["size"])} />
                )}
              </ControlGroup>
              <ControlGroup label="Massa">
                <SegmentedControl options={catalog.masses.map((mass) => ({ id: mass.id, label: mass.name }))} value={selection.mass} onChange={(value) => setSelection((current) => ({ ...current, mass: value as PizzaSelection["mass"] }))} />
              </ControlGroup>
            </div>
          </section>

          <section className="mt-4">
            <p className="text-[10px] font-black uppercase tracking-[.14em] text-basso-wine">Sabores</p>
            <h3 className="mt-0.5 font-display text-[1.65rem] font-black leading-tight">Como você quer sua pizza?</h3>

            {selection.size === "grande" ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ModeButton active={!isHalfHalf} title="1 sabor" subtitle="Pizza inteira" onClick={useWholePizza} />
                <ModeButton active={isHalfHalf} title="Meio a meio" subtitle="2 sabores • 50% + 50%" onClick={startHalfHalf} />
              </div>
            ) : (
              <div className="mt-3 rounded-xl bg-basso-wine/[.055] px-4 py-3 text-sm font-semibold text-basso-wine">Broto aceita um único sabor.</div>
            )}

            <div className="mt-3 space-y-2">
              <FlavorSelectionCard slotLabel={isHalfHalf ? "Metade 1" : selection.size === "broto" ? "Sabor da Broto" : "Pizza inteira"} flavor={currentA} size={selection.size} half={isHalfHalf} onClick={() => openFlavorPicker("A")} />
              {isHalfHalf && currentB && <FlavorSelectionCard slotLabel="Metade 2" flavor={currentB} size={selection.size} half onClick={() => openFlavorPicker("B")} />}
            </div>

            {selection.size === "grande" && (
              <p className="mt-2.5 rounded-xl bg-black/[.025] px-3 py-2.5 text-[11px] leading-relaxed text-black/45">
                No meio a meio, cada sabor representa <strong>50% da pizza</strong>. Tradicional, Premium e Doce são apenas filtros e podem ser combinados.
              </p>
            )}
          </section>

          <section className="mt-5 space-y-2">
            <p className="px-1 text-[10px] font-black uppercase tracking-[.14em] text-black/35">Personalize se quiser</p>

            <details className="mobile-details overflow-hidden rounded-2xl border border-black/8 bg-white">
              <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-3 px-4 py-3 active:bg-black/[.02]">
                <div><p className="text-[15px] font-bold">Retirar ingredientes</p><p className="mt-0.5 text-[11px] text-black/40">{removedCount ? `${removedCount} removido(s)` : "Opcional"}</p></div>
                <ChevronDown size={19} className="mobile-details-chevron shrink-0 text-black/35 transition" />
              </summary>
              <div className="space-y-3 border-t border-black/5 p-3">
                <IngredientList title={currentA.name} ingredients={currentA.ingredients} selected={selection.removedA} onToggle={(ingredient) => toggleRemoved("A", ingredient)} />
                {currentB && <IngredientList title={currentB.name} ingredients={currentB.ingredients} selected={selection.removedB} onToggle={(ingredient) => toggleRemoved("B", ingredient)} />}
              </div>
            </details>

            <details className="mobile-details overflow-hidden rounded-2xl border border-black/8 bg-white">
              <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-3 px-4 py-3 active:bg-black/[.02]">
                <div><p className="text-[15px] font-bold">Adicionais</p><p className="mt-0.5 text-[11px] text-black/40">{addonUnits ? `${addonUnits} unidade(s)` : "Até 5 unidades"}</p></div>
                <ChevronDown size={19} className="mobile-details-chevron shrink-0 text-black/35 transition" />
              </summary>
              <div className="divide-y divide-black/5 border-t border-black/5">
                {catalog.addons.map((addon) => {
                  const quantity = selection.addons[addon.id] || 0;
                  const placement = selection.addonPlacements?.[addon.id] || "whole";
                  return (
                    <div key={addon.id} className="p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{addon.name}</p>
                          <p className="mt-0.5 text-[11px] text-basso-wine">{currency(addon.price)} inteira • {currency(Math.round(addon.price / 2))} metade</p>
                        </div>
                        <div className="flex h-11 shrink-0 items-center rounded-xl border border-black/10 bg-basso-paper/60">
                          <button type="button" className="grid h-11 w-11 place-items-center disabled:opacity-25" disabled={!quantity} onClick={() => setAddon(addon.id, -1)} aria-label={`Remover ${addon.name}`}><Minus size={16} /></button>
                          <span className="w-7 text-center text-sm font-black">{quantity}</span>
                          <button type="button" className="grid h-11 w-11 place-items-center disabled:opacity-25" disabled={quantity >= 2 || addonUnits >= 5} onClick={() => setAddon(addon.id, 1)} aria-label={`Adicionar ${addon.name}`}><Plus size={16} /></button>
                        </div>
                      </div>
                      {quantity > 0 && (
                        <div className={`mt-3 grid gap-1.5 ${currentB ? "grid-cols-3" : "grid-cols-2"}`}>
                          <PlacementButton active={placement === "whole"} onClick={() => setAddonPlacement(addon.id, "whole")}>Inteira</PlacementButton>
                          <PlacementButton active={placement === "halfA"} onClick={() => setAddonPlacement(addon.id, "halfA")}>{currentB ? "Metade 1" : "Metade"}</PlacementButton>
                          {currentB && <PlacementButton active={placement === "halfB"} onClick={() => setAddonPlacement(addon.id, "halfB")}>Metade 2</PlacementButton>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>

            <details className="mobile-details overflow-hidden rounded-2xl border border-black/8 bg-white">
              <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-3 px-4 py-3 active:bg-black/[.02]">
                <div><p className="text-[15px] font-bold">Observações</p><p className="mt-0.5 text-[11px] text-black/40">{selection.notes.trim() ? "Observação adicionada" : "Opcional"}</p></div>
                <ChevronDown size={19} className="mobile-details-chevron shrink-0 text-black/35 transition" />
              </summary>
              <div className="border-t border-black/5 p-3">
                <textarea id="pizza-notes" className="textarea min-h-28 text-base" maxLength={500} value={selection.notes} onChange={(event) => setSelection((current) => ({ ...current, notes: event.target.value }))} placeholder="Ex.: assar bem, cortar em 8 pedaços..." />
                <p className="mt-1 text-right text-xs text-black/35">{selection.notes.length}/500</p>
              </div>
            </details>
          </section>

          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

          <div className="sticky bottom-0 z-20 -mx-4 mt-5 border-t border-black/5 bg-basso-paper/95 px-4 pt-3 backdrop-blur-xl sm:-mx-5 sm:px-5" style={{ paddingBottom: "max(.75rem, env(safe-area-inset-bottom))" }}>
            <div className="mb-2 flex items-center justify-between px-1 md:hidden"><span className="text-xs font-semibold text-black/45">Total</span><strong className="text-lg text-basso-wine">{currency(total)}</strong></div>
            <button type="button" className="btn-primary min-h-14 w-full rounded-2xl text-base shadow-lg shadow-basso-wine/15" onClick={add} disabled={!total}>
              <ShoppingBag size={19} />
              <span>{initialSelection ? "Salvar alterações" : "Adicionar à sacola"}</span>
              <span className="hidden opacity-70 sm:inline">•</span>
              <strong className="hidden sm:inline">{currency(total)}</strong>
            </button>
          </div>
        </div>
      </div>

      {flavorPicker && (
        <FlavorPickerSheet
          slot={flavorPicker}
          size={selection.size}
          currentA={currentA}
          currentB={currentB}
          results={flavorPickerResults}
          categories={availablePickerCategories}
          category={flavorCategory}
          query={flavorQuery}
          onCategory={setFlavorCategory}
          onQuery={setFlavorQuery}
          onChoose={(nextFlavor) => chooseFlavor(flavorPicker, nextFlavor)}
          onClose={() => { setFlavorPicker(null); setFlavorQuery(""); setFlavorCategory("all"); }}
        />
      )}
    </Modal>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-[10px] font-black uppercase tracking-[.13em] text-black/35">{label}</p>{children}</div>;
}

function SegmentedControl({ options, value, onChange }: { options: Array<{ id: string; label: string }>; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/[.035] p-1">
      {options.map((option) => (
        <button type="button" key={option.id} onClick={() => onChange(option.id)} className={`min-h-11 rounded-lg px-3 text-sm font-bold transition active:scale-[.98] ${value === option.id ? "bg-white text-basso-wine shadow-sm ring-1 ring-black/5" : "text-black/45"}`}>{option.label}</button>
      ))}
    </div>
  );
}

function ModeButton({ active, title, subtitle, onClick }: { active: boolean; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`min-h-[72px] rounded-2xl border p-3 text-left transition active:scale-[.99] ${active ? "border-basso-wine bg-basso-wine text-white shadow-sm" : "border-black/10 bg-white text-black"}`}>
      <p className="text-[15px] font-black leading-tight">{title}</p>
      <p className={`mt-1 text-[10px] font-semibold ${active ? "text-white/70" : "text-black/40"}`}>{subtitle}</p>
    </button>
  );
}

function FlavorSelectionCard({ slotLabel, flavor, size, half, onClick }: { slotLabel: string; flavor: Flavor; size: PizzaSelection["size"]; half?: boolean; onClick: () => void }) {
  const fullPrice = size === "grande" ? flavor.priceGrande : flavor.priceBroto;
  const shownPrice = half ? Math.round(fullPrice / 2) : fullPrice;
  return (
    <button type="button" onClick={onClick} className="w-full rounded-2xl border border-black/10 bg-white p-4 text-left shadow-sm transition active:scale-[.99] sm:hover:border-basso-wine/35 sm:hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[.13em] text-basso-wine">{slotLabel}</p>
          <h4 className="mt-1 font-display text-xl font-black leading-tight">{flavor.name}</h4>
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-black/42">{flavor.ingredients.join(", ")}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-basso-cream text-basso-wine"><ChevronRight size={18} /></span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/5 pt-3">
        <span className="rounded-full bg-basso-cream px-2 py-1 text-[9px] font-black uppercase text-basso-wine">{flavorCategoryLabels[flavor.category]}</span>
        <div className="text-right"><span className="mr-2 text-[10px] font-semibold text-black/35">Trocar sabor</span><strong className="text-sm text-basso-wine">{half ? "50% • " : ""}{currency(shownPrice)}</strong></div>
      </div>
    </button>
  );
}

function FlavorPickerSheet({ slot, size, currentA, currentB, results, categories, category, query, onCategory, onQuery, onChoose, onClose }: {
  slot: FlavorSlot;
  size: PizzaSelection["size"];
  currentA: Flavor;
  currentB?: Flavor;
  results: Flavor[];
  categories: Flavor["category"][];
  category: FlavorCategoryFilter;
  query: string;
  onCategory: (category: FlavorCategoryFilter) => void;
  onQuery: (value: string) => void;
  onChoose: (flavor: Flavor) => void;
  onClose: () => void;
}) {
  const selectedId = slot === "A" ? currentA.id : currentB?.id;
  const isHalf = slot === "B" || Boolean(currentB);

  return (
    <div className="fixed inset-0 z-[160] flex h-[100dvh] flex-col bg-basso-paper sm:items-center sm:justify-center sm:bg-black/60 sm:p-4 sm:backdrop-blur-sm">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-basso-paper sm:h-auto sm:max-h-[90dvh] sm:max-w-xl sm:rounded-3xl sm:shadow-2xl">
        <div className="shrink-0 border-b border-black/5 bg-white px-4 pb-3 pt-[calc(.5rem+env(safe-area-inset-top))] sm:px-5 sm:pt-4">
          <div className="flex min-h-11 items-center gap-3">
            <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/5 active:scale-95" onClick={onClose} aria-label="Voltar"><ArrowLeft size={20} /></button>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-[.14em] text-basso-wine">{slot === "A" ? (isHalf ? "Metade 1" : "Sabor da pizza") : "Metade 2"}</p>
              <h3 className="truncate font-display text-xl font-black">Escolha o sabor</h3>
            </div>
          </div>

          {slot === "B" && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-basso-cream px-3 py-2.5 text-xs text-basso-wine">
              <span className="font-semibold">Metade 1</span><strong className="truncate">{currentA.name}</strong>
            </div>
          )}

          <label className="relative mt-3 block">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
            <input className="input h-12 pl-10 text-base" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Buscar sabor ou ingrediente" enterKeyHint="search" inputMode="search" autoComplete="off" />
          </label>

          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:-mx-5 sm:px-5">
            <CategoryChip active={category === "all"} onClick={() => onCategory("all")}>Todos</CategoryChip>
            {categories.map((item) => <CategoryChip key={item} active={category === item} onClick={() => onCategory(item)}>{flavorCategoryLabels[item]}</CategoryChip>)}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="space-y-2.5">
            {results.map((item) => {
              const fullPrice = size === "grande" ? item.priceGrande : item.priceBroto;
              const contribution = isHalf ? Math.round(fullPrice / 2) : fullPrice;
              const selected = item.id === selectedId;
              return (
                <button type="button" key={item.id} onClick={() => onChoose(item)} className={`w-full rounded-2xl border p-3.5 text-left transition active:scale-[.995] ${selected ? "border-basso-wine bg-basso-wine/[.055] ring-1 ring-basso-wine/20" : "border-black/8 bg-white"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${selected ? "bg-basso-wine text-white" : "bg-basso-cream text-basso-wine"}`}>{selected ? <Check size={17} /> : <span className="text-[11px] font-black">{item.name.charAt(0)}</span>}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><h4 className="text-[15px] font-black leading-tight">{item.name}</h4><strong className="shrink-0 text-sm text-basso-wine">{currency(contribution)}</strong></div>
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-black/42">{item.ingredients.join(", ")}</p>
                      <div className="mt-2 flex items-center gap-2"><span className="rounded-full bg-basso-cream px-2 py-0.5 text-[8px] font-black uppercase text-basso-wine">{flavorCategoryLabels[item.category]}</span>{isHalf && <span className="text-[9px] font-bold text-black/30">valor de 50%</span>}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {!results.length && (
            <div className="grid min-h-56 place-items-center p-6 text-center"><div><Search className="mx-auto text-black/20" size={28} /><p className="mt-3 font-bold">Nenhum sabor encontrado</p><p className="mt-1 text-xs text-black/40">Tente outro termo ou outra categoria.</p></div></div>
          )}
        </div>

        <div className="shrink-0 border-t border-black/5 bg-white px-4 pt-2 text-center" style={{ paddingBottom: "max(.65rem, env(safe-area-inset-bottom))" }}>
          <p className="text-[10px] leading-relaxed text-black/35">{results.length} sabor(es) disponível(is) neste filtro.</p>
        </div>
      </div>
    </div>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`min-h-10 shrink-0 rounded-full px-3.5 text-xs font-bold ${active ? "bg-basso-wine text-white" : "border border-black/10 bg-white text-black/55"}`}>{children}</button>;
}

function PlacementButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className={`min-h-10 rounded-xl border px-2 text-[10px] font-bold ${active ? "border-basso-wine bg-basso-wine text-white" : "border-black/10 bg-white text-black/50"}`} onClick={onClick}>{children}</button>;
}

function IngredientList({ title, ingredients, selected, onToggle }: { title: string; ingredients: string[]; selected: string[]; onToggle: (ingredient: string) => void }) {
  return (
    <div className="rounded-xl bg-basso-paper/70 p-2.5">
      <p className="mb-2 text-xs font-bold text-basso-wine">{title}</p>
      <div className="flex flex-wrap gap-2">
        {ingredients.map((ingredient) => (
          <button type="button" key={ingredient} className={`min-h-10 rounded-full border px-3 py-2 text-xs font-semibold transition ${selected.includes(ingredient) ? "border-red-300 bg-red-50 text-red-700 line-through" : "border-black/10 bg-white"}`} onClick={() => onToggle(ingredient)}>{ingredient}</button>
        ))}
      </div>
    </div>
  );
}
