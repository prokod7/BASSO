"use client";

import Image from "next/image";
import { Check, ChevronRight, Heart, Minus, Plus, Search, ShoppingBag, X } from "lucide-react";
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
  const flavors = flavorsForEntry(entry);
  const prices = flavors.map((flavor) =>
    entry.size === "grande" ? flavor.priceGrande : flavor.priceBroto,
  );
  return prices.length ? Math.min(...prices) : 0;
}

function normalizePlacementsWithoutSecondHalf(placements: PizzaSelection["addonPlacements"]): PizzaSelection["addonPlacements"] {
  return Object.fromEntries(
    Object.entries(placements || {}).map(([id, placement]) => [id, placement === "halfB" ? "whole" : placement]),
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
  const subtitle =
    entry.size === "grande"
      ? "Escolha 1 ou 2 sabores e monte sua pizza."
      : "Escolha 1 sabor. Broto não aceita meio a meio.";

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="surface group grid min-h-[154px] w-full overflow-hidden text-left transition hover:-translate-y-0.5 hover:border-basso-gold hover:shadow-premium sm:grid-cols-[1fr_138px]"
      aria-label={`Abrir ${scopeLabels[entry.scope]} tamanho ${sizeLabel}`}
    >
      <div className="flex min-w-0 flex-col p-5">
        <span className="text-[10px] font-black uppercase tracking-[.16em] text-basso-gold">
          {scopeLabels[entry.scope]}
        </span>
        <h3 className="mt-2 font-display text-2xl font-bold">Pizza {sizeLabel}</h3>
        <p className="mt-2 text-xs leading-relaxed text-black/50">{subtitle}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <span className="text-[10px] uppercase tracking-wide text-black/40">A partir de</span>
            <strong className="block text-lg text-basso-wine">{currency(minimumForEntry(entry))}</strong>
          </div>
          {typeof resultCount === "number" && (
            <span className="rounded-full bg-basso-paper px-3 py-1 text-[10px] font-bold text-black/50">
              {resultCount} {resultCount === 1 ? "sabor" : "sabores"}
            </span>
          )}
        </div>
      </div>
      <div className="relative min-h-32 overflow-hidden bg-basso-black sm:min-h-full">
        <Image
          src={imageForEntry(entry)}
          alt={`${scopeLabels[entry.scope]} ${sizeLabel}`}
          fill
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-black/10" />
        <span className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-basso-wine text-white shadow-lg">
          <Plus size={19} />
        </span>
      </div>
    </button>
  );
}

export function PizzaCard({ flavor, onOpen }: { flavor: Flavor; onOpen: (f: Flavor) => void }) {
  const min = Math.min(flavor.priceGrande, flavor.priceBroto);
  const ref = `flavor:${flavor.id}`;
  const favorite = useCustomerDeviceState((state) => state.favorites.includes(ref));

  return (
    <article className="surface group relative flex min-h-[168px] overflow-hidden transition hover:-translate-y-0.5 hover:shadow-premium">
      <button
        type="button"
        className={`absolute right-3 top-3 z-10 rounded-full p-2 ${
          favorite ? "bg-red-50 text-red-600" : "bg-black/5 text-black/35"
        }`}
        onClick={() => customerDeviceActions.toggleFavorite(ref)}
        aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      >
        <Heart size={16} fill={favorite ? "currentColor" : "none"} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-center gap-2 pr-10">
          <h3 className="font-display text-lg font-bold leading-tight">{flavor.name}</h3>
          {flavor.featured && (
            <span className="rounded-full bg-basso-gold/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-basso-wine">
              Mais pedida
            </span>
          )}
        </div>
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-black/55">{flavor.description}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <span className="text-[10px] uppercase tracking-wide text-black/40">A partir de</span>
            <strong className="block text-base text-basso-wine">{currency(min)}</strong>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full bg-basso-wine text-white transition group-hover:scale-105"
            onClick={() => onOpen(flavor)}
            aria-label={`Montar pizza ${flavor.name}`}
          >
            <Plus size={19} />
          </button>
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
  const [selection, setSelection] = useState<PizzaSelection>(() =>
    initial(seedFlavor.id, entry?.size || "grande"),
  );
  const [error, setError] = useState("");
  const [flavorPicker, setFlavorPicker] = useState<FlavorSlot | null>(null);
  const [flavorQuery, setFlavorQuery] = useState("");
  const [flavorCategory, setFlavorCategory] = useState<FlavorCategoryFilter>("all");

  const currentA = findFlavor(selection.flavorA) || seedFlavor;
  const currentB = selection.flavorB ? findFlavor(selection.flavorB) : undefined;

  const flavorPickerBase = useMemo(() => {
    if (!flavorPicker) return [];
    if (flavorPicker === "A") {
      const base = entry ? entryFlavors : catalog.flavors.filter((item) => item.active);
      return base.some((item) => item.id === currentA.id) ? base : [currentA, ...base];
    }
    return catalog.flavors.filter(
      (item) => item.active && item.id !== currentA.id && arePizzaFlavorsCompatible(currentA, item),
    );
  }, [flavorPicker, entry, entryFlavors, currentA]);

  const flavorPickerResults = useMemo(() => {
    const normalized = normalizeSearchText(flavorQuery);
    return flavorPickerBase.filter((item) => {
      if (flavorCategory !== "all" && item.category !== flavorCategory) return false;
      if (!normalized) return true;
      return normalizeSearchText(`${item.name} ${item.description} ${item.ingredients.join(" ")}`).includes(normalized);
    });
  }, [flavorPickerBase, flavorCategory, flavorQuery]);

  const availablePickerCategories = useMemo(() => {
    const categories = (["traditional", "premium", "sweet"] as Flavor["category"][])
      .filter((category) => flavorPickerBase.some((item) => item.category === category));
    return categories;
  }, [flavorPickerBase]);

  const total = useMemo(() => {
    try {
      return pizzaTotal(selection);
    } catch {
      return 0;
    }
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
    // The modal must reset whenever another card/category is opened.
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
        if (!arePizzaFlavorsCompatible(a, nextFlavor)) return current;
        return { ...current, flavorB: nextFlavor.id, removedB: [] };
      }

      const previousB = current.flavorB ? findFlavor(current.flavorB) : undefined;
      const keepSecond = Boolean(previousB && arePizzaFlavorsCompatible(nextFlavor, previousB));
      return {
        ...current,
        flavorA: nextFlavor.id,
        flavorB: keepSecond ? current.flavorB : undefined,
        removedA: [],
        removedB: keepSecond ? current.removedB : [],
        addonPlacements: keepSecond
          ? current.addonPlacements
          : normalizePlacementsWithoutSecondHalf(current.addonPlacements),
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

  const toggleRemoved = (half: "A" | "B", ingredient: string) =>
    setSelection((current) => {
      const key = half === "A" ? "removedA" : "removedB";
      const list = current[key];
      return {
        ...current,
        [key]: list.includes(ingredient)
          ? list.filter((item) => item !== ingredient)
          : [...list, ingredient],
      };
    });

  const setAddon = (id: string, delta: number) =>
    setSelection((current) => {
      const quantity = current.addons[id] || 0;
      const next = Math.max(0, Math.min(2, quantity + delta));
      const sumWithout = Object.entries(current.addons)
        .filter(([key]) => key !== id)
        .reduce((sum, [, value]) => sum + value, 0);
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
      const name = `Pizza ${selection.size === "grande" ? "Grande" : "Broto"} • ${a.name}${
        b ? ` / ${b.name}` : ""
      }`;
      const item: CartItem = {
        id: uid("cart"),
        kind: "pizza",
        name,
        quantity: 1,
        unitPrice: pizzaTotal(selection),
        image: entry ? imageForEntry(entry) : categoryImages[a.category][selection.size],
        selection,
      };
      if (onAdd) onAdd(item);
      else cart.addItem(item);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar a pizza.");
    }
  };

  if (!flavor && !entry) return null;

  const sizeLabel = selection.size === "grande" ? "Grande" : "Broto";
  const scopeLabel = entry ? scopeLabels[entry.scope] : "Pizza artesanal";
  const builderImage = entry ? imageForEntry(entry) : categoryImages[currentA.category][selection.size];
  const isHalfHalf = Boolean(currentB);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialSelection ? "Editar pizza" : entry ? `${scopeLabel} • ${sizeLabel}` : "Monte sua pizza"}
      className="sm:max-w-3xl"
    >
      <div className="grid md:grid-cols-[260px_1fr]">
        <div className="relative min-h-48 bg-basso-black md:min-h-full">
          <Image src={builderImage} alt={`${scopeLabel} ${sizeLabel}`} fill className="object-cover opacity-85" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
          <div className="absolute bottom-0 p-5 text-white">
            <p className="text-xs uppercase tracking-[.2em] text-basso-goldLight">{scopeLabel}</p>
            <h3 className="mt-1 font-display text-2xl font-bold">
              {currentA.name}
              {currentB ? ` + ${currentB.name}` : ""}
            </h3>
            <p className="mt-2 text-xs text-white/70">Imagem geral da categoria e do tamanho selecionados.</p>
          </div>
        </div>

        <div className="space-y-6 p-5">
          <section>
            <p className="label">1. Tamanho</p>
            {entry ? (
              <div className="rounded-xl border border-basso-wine bg-basso-wine/5 p-4 ring-1 ring-basso-wine">
                <span className="block font-bold">{sizeLabel}</span>
                <span className="text-xs text-black/45">
                  {selection.size === "grande" ? "Até 2 sabores" : "Somente 1 sabor"}
                </span>
                <p className="mt-2 text-[11px] font-semibold text-basso-wine">
                  Para trocar o tamanho, feche esta janela e selecione outro card no cardápio.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(["grande", "broto"] as const).map((size) => (
                  <button
                    type="button"
                    key={size}
                    className={`rounded-xl border p-3 text-left ${
                      selection.size === size
                        ? "border-basso-wine bg-basso-wine/5 ring-1 ring-basso-wine"
                        : "border-black/10 bg-white"
                    }`}
                    onClick={() =>
                      setSelection((current) => ({
                        ...current,
                        size,
                        flavorB: size === "broto" ? undefined : current.flavorB,
                        removedB: size === "broto" ? [] : current.removedB,
                        addonPlacements: size === "broto"
                          ? normalizePlacementsWithoutSecondHalf(current.addonPlacements)
                          : current.addonPlacements,
                      }))
                    }
                  >
                    <span className="block font-bold">{size === "grande" ? "Grande" : "Broto"}</span>
                    <span className="text-xs text-black/45">
                      {size === "grande" ? "Até 2 sabores" : "Somente 1 sabor"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="label">2. Massa</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {catalog.masses.map((mass) => (
                <button
                  type="button"
                  key={mass.id}
                  className={`rounded-xl border p-3 text-left text-sm font-semibold ${
                    selection.mass === mass.id
                      ? "border-basso-wine bg-basso-wine/5 ring-1 ring-basso-wine"
                      : "border-black/10 bg-white"
                  }`}
                  onClick={() =>
                    setSelection((current) => ({
                      ...current,
                      mass: mass.id as PizzaSelection["mass"],
                    }))
                  }
                >
                  {selection.mass === mass.id && <Check size={15} className="mr-1 inline" />}
                  {mass.name}
                  <span className="block text-xs font-normal text-emerald-700">Sem acréscimo</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="label mb-1">3. Sabores</p>
                <p className="text-xs leading-relaxed text-black/45">Escolha visualmente; não precisa percorrer listas enormes.</p>
              </div>
              {selection.size === "grande" && (
                <span className="rounded-full bg-basso-cream px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-basso-wine">
                  {isHalfHalf ? "Meio a meio" : "Pizza inteira"}
                </span>
              )}
            </div>

            {selection.size === "grande" && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-black/[.035] p-1.5">
                <button
                  type="button"
                  onClick={useWholePizza}
                  className={`min-h-12 rounded-xl px-3 text-sm font-bold transition ${!isHalfHalf ? "bg-white text-basso-wine shadow-sm ring-1 ring-black/5" : "text-black/45"}`}
                >
                  1 sabor
                </button>
                <button
                  type="button"
                  onClick={() => openFlavorPicker("B")}
                  className={`min-h-12 rounded-xl px-3 text-sm font-bold transition ${isHalfHalf ? "bg-white text-basso-wine shadow-sm ring-1 ring-black/5" : "text-black/45"}`}
                >
                  2 sabores
                </button>
              </div>
            )}

            <div className={`mt-3 grid gap-2 ${isHalfHalf ? "sm:grid-cols-2" : ""}`}>
              <FlavorSelectionCard
                slotLabel={isHalfHalf ? "Metade 1 • 50%" : selection.size === "grande" ? "Pizza inteira" : "Sabor da Broto"}
                flavor={currentA}
                size={selection.size}
                half={isHalfHalf}
                onClick={() => openFlavorPicker("A")}
              />
              {isHalfHalf && currentB && (
                <FlavorSelectionCard
                  slotLabel="Metade 2 • 50%"
                  flavor={currentB}
                  size={selection.size}
                  half
                  onClick={() => openFlavorPicker("B")}
                />
              )}
            </div>

            {selection.size === "grande" && (
              <div className="mt-3 rounded-xl border border-black/5 bg-white/65 px-3 py-2.5 text-xs leading-relaxed text-black/50">
                Meio a meio cobra <strong>50% do valor de cada sabor</strong>. Pizza Tradicional não pode ser combinada com Premium; sabores Doces podem combinar com Tradicional ou Premium.
              </div>
            )}
          </section>

          <section>
            <p className="label">4. Retirar ingredientes</p>
            <div className="space-y-3">
              <IngredientList
                title={currentA.name}
                ingredients={currentA.ingredients}
                selected={selection.removedA}
                onToggle={(ingredient) => toggleRemoved("A", ingredient)}
              />
              {currentB && (
                <IngredientList
                  title={currentB.name}
                  ingredients={currentB.ingredients}
                  selected={selection.removedB}
                  onToggle={(ingredient) => toggleRemoved("B", ingredient)}
                />
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <p className="label mb-0">5. Adicionais</p>
              <span className="text-xs text-black/45">Máx. 5 unidades; 2 por adicional</span>
            </div>
            <div className="mt-2 divide-y divide-black/5 rounded-xl border border-black/10 bg-white">
              {catalog.addons.map((addon) => {
                const quantity = selection.addons[addon.id] || 0;
                return (
                  <div key={addon.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{addon.name}</p>
                      <p className="text-xs text-basso-wine">{currency(addon.price)} inteira • {currency(Math.round(addon.price / 2))} em uma metade</p>
                      {quantity > 0 && (
                        <div className="mt-2">
                          <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-black/40">Onde vai este adicional?</p>
                          <div className="grid gap-1 sm:grid-cols-3">
                            <button type="button" className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold ${(selection.addonPlacements?.[addon.id] || "whole") === "whole" ? "border-basso-wine bg-basso-wine/5 text-basso-wine" : "border-black/10"}`} onClick={() => setAddonPlacement(addon.id, "whole")}>Pizza inteira</button>
                            <button type="button" className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold ${selection.addonPlacements?.[addon.id] === "halfA" ? "border-basso-wine bg-basso-wine/5 text-basso-wine" : "border-black/10"}`} onClick={() => setAddonPlacement(addon.id, "halfA")}>Metade {currentA.name}</button>
                            {currentB && <button type="button" className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold ${selection.addonPlacements?.[addon.id] === "halfB" ? "border-basso-wine bg-basso-wine/5 text-basso-wine" : "border-black/10"}`} onClick={() => setAddonPlacement(addon.id, "halfB")}>Metade {currentB.name}</button>}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center rounded-lg border border-black/10">
                      <button type="button" className="p-2 disabled:opacity-30" disabled={!quantity} onClick={() => setAddon(addon.id, -1)}><Minus size={15} /></button>
                      <span className="w-7 text-center text-xs font-bold">{quantity}</span>
                      <button type="button" className="p-2 disabled:opacity-30" disabled={quantity >= 2 || Object.values(selection.addons).reduce((sum, value) => sum + value, 0) >= 5} onClick={() => setAddon(addon.id, 1)}><Plus size={15} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <label className="label" htmlFor="pizza-notes">
              6. Observações
            </label>
            <textarea
              id="pizza-notes"
              className="textarea"
              maxLength={500}
              value={selection.notes}
              onChange={(event) =>
                setSelection((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Ex.: assar bem, cortar em 8 pedaços..."
            />
            <p className="mt-1 text-right text-xs text-black/40">{selection.notes.length}/500</p>
          </section>

          {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
          <button type="button" className="btn-primary sticky bottom-0 w-full py-3.5" onClick={add}>
            <ShoppingBag size={19} /> {initialSelection ? "Salvar alterações" : "Adicionar ao carrinho"} • {currency(total)}
          </button>
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
          onClose={() => {
            setFlavorPicker(null);
            setFlavorQuery("");
            setFlavorCategory("all");
          }}
        />
      )}
    </Modal>
  );
}

function FlavorSelectionCard({
  slotLabel,
  flavor,
  size,
  half,
  onClick,
}: {
  slotLabel: string;
  flavor: Flavor;
  size: PizzaSelection["size"];
  half?: boolean;
  onClick: () => void;
}) {
  const fullPrice = size === "grande" ? flavor.priceGrande : flavor.priceBroto;
  const shownPrice = half ? Math.round(fullPrice / 2) : fullPrice;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-2xl border border-black/10 bg-white p-4 text-left shadow-sm transition hover:border-basso-wine/35 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-black/35">{slotLabel}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <h4 className="font-display text-xl font-bold leading-tight">{flavor.name}</h4>
            <span className="rounded-full bg-basso-cream px-2 py-0.5 text-[9px] font-black uppercase text-basso-wine">
              {flavorCategoryLabels[flavor.category]}
            </span>
          </div>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-basso-wine/7 text-basso-wine transition group-hover:bg-basso-wine group-hover:text-white">
          <ChevronRight size={17} />
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-black/45">{flavor.description}</p>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/5 pt-3">
        <span className="text-xs font-semibold text-black/40">Toque para trocar</span>
        <strong className="text-sm text-basso-wine">{half ? "50% • " : ""}{currency(shownPrice)}</strong>
      </div>
    </button>
  );
}

function FlavorPickerSheet({
  slot,
  size,
  currentA,
  currentB,
  results,
  categories,
  category,
  query,
  onCategory,
  onQuery,
  onChoose,
  onClose,
}: {
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
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[100dvh] w-full flex-col overflow-hidden bg-basso-paper shadow-2xl sm:max-h-[88vh] sm:max-w-xl sm:rounded-3xl">
        <div className="border-b border-black/5 bg-white px-4 pb-3 pt-[calc(.75rem+env(safe-area-inset-top))] sm:px-5 sm:pt-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-basso-wine">{slot === "A" ? (isHalf ? "Metade 1" : "Sabor da pizza") : "Metade 2"}</p>
              <h3 className="mt-0.5 font-display text-2xl font-black">Escolha o sabor</h3>
            </div>
            <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-black/5" onClick={onClose} aria-label="Fechar seleção de sabores"><X size={19} /></button>
          </div>
          {slot === "B" && (
            <p className="mt-2 rounded-xl bg-basso-cream px-3 py-2 text-xs leading-relaxed text-basso-wine">
              A primeira metade é <strong>{currentA.name}</strong>. Aqui aparecem somente sabores compatíveis.
            </p>
          )}
          <label className="relative mt-3 block">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
            <input
              autoFocus
              className="input h-12 pl-10 text-base"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Buscar sabor ou ingrediente"
            />
          </label>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
            <button
              type="button"
              onClick={() => onCategory("all")}
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${category === "all" ? "bg-basso-wine text-white" : "border border-black/10 bg-white text-black/55"}`}
            >
              Todos
            </button>
            {categories.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => onCategory(item)}
                className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${category === item ? "bg-basso-wine text-white" : "border border-black/10 bg-white text-black/55"}`}
              >
                {flavorCategoryLabels[item]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5">
          <div className="space-y-2">
            {results.map((item) => {
              const fullPrice = size === "grande" ? item.priceGrande : item.priceBroto;
              const contribution = isHalf ? Math.round(fullPrice / 2) : fullPrice;
              const selected = item.id === selectedId;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onChoose(item)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${selected ? "border-basso-wine bg-basso-wine/[.055] ring-1 ring-basso-wine" : "border-black/10 bg-white hover:border-basso-wine/30"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-display text-lg font-bold">{item.name}</h4>
                        <span className="rounded-full bg-basso-cream px-2 py-0.5 text-[9px] font-black uppercase text-basso-wine">{flavorCategoryLabels[item.category]}</span>
                        {selected && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700"><Check size={11} />Selecionado</span>}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-black/45">{item.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[9px] font-black uppercase tracking-wide text-black/30">{isHalf ? "50%" : size === "grande" ? "Grande" : "Broto"}</p>
                      <strong className="text-sm text-basso-wine">{currency(contribution)}</strong>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {!results.length && (
            <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-black/10 bg-white/60 p-6 text-center">
              <div>
                <Search className="mx-auto text-black/20" size={28} />
                <p className="mt-3 font-bold">Nenhum sabor encontrado</p>
                <p className="mt-1 text-xs leading-relaxed text-black/45">Tente outro termo ou escolha outra categoria disponível.</p>
              </div>
            </div>
          )}
          {slot === "B" && currentA.category !== "sweet" && (
            <p className="mt-4 text-center text-[11px] leading-relaxed text-black/40">
              Regra da casa: Tradicional e Premium não podem dividir a mesma pizza. Doces continuam disponíveis quando compatíveis.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function IngredientList({
  title,
  ingredients,
  selected,
  onToggle,
}: {
  title: string;
  ingredients: string[];
  selected: string[];
  onToggle: (ingredient: string) => void;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-3">
      <p className="mb-2 text-xs font-bold text-basso-wine">{title}</p>
      <div className="flex flex-wrap gap-2">
        {ingredients.map((ingredient) => (
          <button
            type="button"
            key={ingredient}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              selected.includes(ingredient)
                ? "border-red-300 bg-red-50 text-red-700 line-through"
                : "border-black/10 bg-basso-paper"
            }`}
            onClick={() => onToggle(ingredient)}
          >
            {ingredient}
          </button>
        ))}
      </div>
    </div>
  );
}
