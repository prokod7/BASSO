"use client";

import Image from "next/image";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Heart,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { catalog, categoryImages, findFlavor } from "@/lib/catalog";
import { runtimePizzaTotal as pizzaTotal } from "@/lib/runtime-catalog";
import { arePizzaFlavorsCompatible, validatePizzaSelection } from "@/lib/pricing";
import { activeMasses, defaultMass, massName, pizzaOptions } from "@/lib/pizza-options";
import type { AddonPlacement, CartItem, Flavor, PizzaSelection } from "@/types";
import { currency, normalizeSearchText, uid } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import { customerDeviceActions, useCustomerDeviceState } from "@/lib/customer-device-store";

export type PizzaMenuScope = Flavor["category"] | "featured";
type FlavorSlot = "A" | "B";
type FlavorCategoryFilter = Flavor["category"] | "all";
type BuilderStep = "pizza" | "customize" | "review";
type CustomizeView = "remove" | "addons" | null;

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

const stepOrder: BuilderStep[] = ["pizza", "customize", "review"];
const stepLabels: Record<BuilderStep, string> = {
  pizza: "Pizza",
  customize: "Personalizar",
  review: "Revisar",
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
    pizzaTotal({size:entry.size,mass:"traditional",flavorA:flavor.id,removedA:[],removedB:[],addons:{},notes:""}),
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
  const subtitle = entry.size === "grande" || entry.scope !== "sweet" ? "1 sabor ou meio a meio" : "1 sabor";

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="surface group grid min-h-[112px] w-full grid-cols-[1fr_88px] overflow-hidden text-left transition active:scale-[.99] sm:min-h-[154px] sm:grid-cols-[1fr_138px] sm:hover:-translate-y-0.5 sm:hover:border-basso-gold sm:hover:shadow-premium"
      aria-label={`Abrir ${scopeLabels[entry.scope]} tamanho ${sizeLabel}`}
    >
      <div className="flex min-w-0 flex-col p-3.5 sm:p-5">
        <span className="text-[9px] font-black uppercase tracking-[.14em] text-basso-gold sm:text-[10px]">
          {scopeLabels[entry.scope]}
        </span>
        <h3 className="mt-1 font-display text-xl font-black sm:mt-2 sm:text-2xl">Pizza {sizeLabel}</h3>
        <p className="mt-0.5 text-[11px] font-semibold text-black/45 sm:mt-1 sm:text-xs">{subtitle}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div>
            <span className="text-[8px] uppercase tracking-wide text-black/35 sm:text-[9px]">A partir de</span>
            <strong className="block text-base text-basso-wine sm:text-lg">{currency(minimumForEntry(entry))}</strong>
          </div>
          {typeof resultCount === "number" && (
            <span className="rounded-full bg-basso-paper px-2 py-1 text-[9px] font-bold text-black/45">{resultCount}</span>
          )}
        </div>
      </div>
      <div className="relative min-h-full overflow-hidden bg-basso-black">
        <Image
          src={imageForEntry(entry)}
          alt={`${scopeLabels[entry.scope]} ${sizeLabel}`}
          fill
          sizes="(max-width: 640px) 88px, 138px"
          className="object-cover transition duration-500 sm:group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-black/10" />
        <span className="absolute bottom-2.5 right-2.5 grid h-8 w-8 place-items-center rounded-full bg-basso-wine text-white shadow-lg sm:bottom-3 sm:right-3 sm:h-9 sm:w-9">
          <Plus size={17} />
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
    <article className="surface group relative flex min-h-[136px] overflow-hidden transition sm:min-h-[168px] sm:hover:-translate-y-0.5 sm:hover:shadow-premium">
      <button
        type="button"
        className={`absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full ${favorite ? "bg-red-50 text-red-600" : "bg-black/5 text-black/35"}`}
        onClick={() => customerDeviceActions.toggleFavorite(ref)}
        aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      >
        <Heart size={16} fill={favorite ? "currentColor" : "none"} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-center gap-2 pr-10">
          <h3 className="font-display text-lg font-bold leading-tight">{flavor.name}</h3>
          {flavor.featured && (
            <span className="rounded-full bg-basso-gold/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-basso-wine">Mais pedida</span>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-black/50">{flavor.description}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <span className="text-[9px] uppercase tracking-wide text-black/35">A partir de</span>
            <strong className="block text-base text-basso-wine">{currency(min)}</strong>
          </div>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full bg-basso-wine text-white transition active:scale-95"
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
  mass: defaultMass(),
  flavorA: flavorId,
  removedA: [],
  removedB: [],
  addons: {},
  addonPlacements: {},
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
  const [step, setStep] = useState<BuilderStep>("pizza");
  const [customizeView, setCustomizeView] = useState<CustomizeView>(null);
  const [error, setError] = useState("");
  const [flavorPicker, setFlavorPicker] = useState<FlavorSlot | null>(null);
  const [flavorQuery, setFlavorQuery] = useState("");
  const [flavorCategory, setFlavorCategory] = useState<FlavorCategoryFilter>("all");
  const [pendingPlacement, setPendingPlacement] = useState<string | null>(null);
  // Ao abrir pelo card genérico ("Pizza Grande"), nenhum sabor vem pré-escolhido:
  // o cliente precisa tocar no sabor antes de avançar.
  const [flavorChosen, setFlavorChosen] = useState(() => Boolean(flavor || initialSelection));

  const currentA = findFlavor(selection.flavorA) || seedFlavor;
  const currentB = selection.flavorB ? findFlavor(selection.flavorB) : undefined;
  const isHalfHalf = Boolean(currentB);
  const hasSweetFlavor = currentA.category === "sweet" || currentB?.category === "sweet";
  const pricedSelection: PizzaSelection = {
    ...selection,
    sweetBase: hasSweetFlavor ? selection.sweetBase ?? "standard" : undefined,
    cutPreference: hasSweetFlavor ? selection.cutPreference ?? "uncut" : undefined,
  };
  const removedCount = selection.removedA.length + selection.removedB.length;
  const addonUnits = Object.values(selection.addons).reduce((sum, value) => sum + value, 0);
  const missingPlacementId = Object.entries(selection.addons).find(
    ([id, quantity]) => quantity > 0 && !selection.addonPlacements?.[id],
  )?.[0];

  const total = (() => {
    try {
      return pizzaTotal(pricedSelection);
    } catch {
      return 0;
    }
  })();

  const flavorPickerBase = useMemo(() => {
    const active = catalog.flavors.filter((item) => item.active);
    if (!flavorPicker) return [];
    if (flavorPicker === "B") {
      return active.filter((item) => item.id !== currentA.id && arePizzaFlavorsCompatible(currentA, item, selection.size));
    }
    return active;
  }, [flavorPicker, currentA, selection.size]);

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

  const resetFor = (nextFlavor: Flavor, size: PizzaSelection["size"]) => {
    setSelection(initial(nextFlavor.id, size));
    setStep("pizza");
    setCustomizeView(null);
    setFlavorPicker(null);
    setFlavorQuery("");
    setFlavorCategory("all");
    setPendingPlacement(null);
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
      setStep("pizza");
      setCustomizeView(null);
      setFlavorPicker(null);
      setFlavorQuery("");
      setFlavorCategory("all");
      setPendingPlacement(null);
      setError("");
      setFlavorChosen(true);
      return;
    }
    const nextFlavor = flavor || entryFlavors[0] || catalog.flavors.find((item) => item.active);
    if (nextFlavor) resetFor(nextFlavor, entry?.size || "grande");
    setFlavorChosen(Boolean(flavor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalKey, open, initialSelection]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const closeFlavorPicker = () => {
    setFlavorPicker(null);
    setFlavorQuery("");
    setFlavorCategory("all");
  };

  const navigateBack = () => {
    if (pendingPlacement) {
      setPendingPlacement(null);
      return;
    }
    if (flavorPicker) {
      closeFlavorPicker();
      return;
    }
    if (customizeView) {
      setCustomizeView(null);
      setError("");
      return;
    }
    const index = stepOrder.indexOf(step);
    if (index > 0) {
      setStep(stepOrder[index - 1]);
      setError("");
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") navigateBack();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, flavorPicker, customizeView, pendingPlacement]);

  const openFlavorPicker = (slot: FlavorSlot) => {
    setFlavorQuery("");
    if (slot === "A" && entry && entry.scope !== "featured") setFlavorCategory(entry.scope);
    else setFlavorCategory("all");
    setFlavorPicker(slot);
    setError("");
  };

  const chooseFlavor = (slot: FlavorSlot, nextFlavor: Flavor) => {
    setSelection((current) => {
      if (slot === "B") {
        const first = findFlavor(current.flavorA) || currentA;
        if (!arePizzaFlavorsCompatible(first, nextFlavor, current.size) || first.id === nextFlavor.id) return current;
        return { ...current, flavorB: nextFlavor.id, removedB: [] };
      }
      const previousB = current.flavorB ? findFlavor(current.flavorB) : undefined;
      const keepSecond = Boolean(previousB && previousB.id !== nextFlavor.id && arePizzaFlavorsCompatible(nextFlavor, previousB, current.size));
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
    if (slot === "A") setFlavorChosen(true);
    closeFlavorPicker();
    setError("");
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
    if (!flavorChosen) { openFlavorPicker("A"); return; }
    if (currentB) return;
    openFlavorPicker("B");
  };

  const changeSize = (size: PizzaSelection["size"]) =>
    setSelection((current) => ({
      ...current,
      size,
      flavorB: size === "broto" && (current.flavorB && (findFlavor(current.flavorA)?.category === "sweet") !== (findFlavor(current.flavorB)?.category === "sweet")) ? undefined : current.flavorB,
      removedB: size === "broto" && (current.flavorB && (findFlavor(current.flavorA)?.category === "sweet") !== (findFlavor(current.flavorB)?.category === "sweet")) ? [] : current.removedB,
      addonPlacements:
        size === "broto" && (current.flavorB && (findFlavor(current.flavorA)?.category === "sweet") !== (findFlavor(current.flavorB)?.category === "sweet"))
          ? normalizePlacementsWithoutSecondHalf(current.addonPlacements)
          : current.addonPlacements,
    }));

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

  const changeAddon = (id: string, delta: number) => {
    const quantity = selection.addons[id] || 0;
    const next = Math.max(0, Math.min(2, quantity + delta));
    const sumWithout = Object.entries(selection.addons)
      .filter(([key]) => key !== id)
      .reduce((sum, [, value]) => sum + value, 0);
    if (sumWithout + next > 5) return;

    setSelection((current) => {
      const placements = { ...(current.addonPlacements || {}) };
      if (next === 0) delete placements[id];
      if (quantity === 0 && next > 0) delete placements[id];
      return {
        ...current,
        addons: { ...current.addons, [id]: next },
        addonPlacements: placements,
      };
    });

    if (quantity === 0 && next > 0) setPendingPlacement(id);
    if (next === 0 && pendingPlacement === id) setPendingPlacement(null);
  };

  const choosePlacement = (id: string, placement: AddonPlacement) => {
    setSelection((current) => ({
      ...current,
      addonPlacements: { ...(current.addonPlacements || {}), [id]: placement },
    }));
    setPendingPlacement(null);
    setError("");
  };

  const goToCustomize = () => {
    if (!flavorChosen) {
      openFlavorPicker("A");
      return;
    }
    try {
      validatePizzaSelection({ ...pricedSelection, addons: {}, addonPlacements: {} });
      setStep("customize");
      setCustomizeView(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revise os sabores escolhidos.");
    }
  };

  const goToReview = () => {
    if (missingPlacementId) {
      setCustomizeView("addons");
      setPendingPlacement(missingPlacementId);
      setError("Escolha onde vai cada adicional antes de continuar.");
      return;
    }
    try {
      validatePizzaSelection(pricedSelection);
      setStep("review");
      setCustomizeView(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revise a personalização da pizza.");
    }
  };

  const add = () => {
    if (missingPlacementId) {
      setStep("customize");
      setCustomizeView("addons");
      setPendingPlacement(missingPlacementId);
      setError("Escolha onde vai cada adicional antes de adicionar à sacola.");
      return;
    }
    try {
      validatePizzaSelection(pricedSelection);
      const first = findFlavor(selection.flavorA)!;
      const second = selection.flavorB ? findFlavor(selection.flavorB) : undefined;
      const sweetDetails = hasSweetFlavor ? ` • ${pricedSelection.cutPreference === "cut" ? "CORTAR" : "NÃO CORTAR"}${pricedSelection.sweetBase === "hazelnut-zero" ? ` • Base ${pizzaOptions().hazelnut.name}` : ""}` : "";
      const name = `Pizza ${selection.size === "grande" ? "Grande" : "Broto"} • ${first.name}${second ? ` / ${second.name}` : ""}${sweetDetails}`;
      const item: CartItem = {
        id: uid("cart"),
        kind: "pizza",
        name,
        quantity: 1,
        unitPrice: pizzaTotal(pricedSelection),
        image: entry ? imageForEntry(entry) : categoryImages[first.category][selection.size],
        selection: pricedSelection,
      };
      if (onAdd) onAdd(item);
      else cart.addItem(item);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar a pizza.");
    }
  };

  if (!open || (!flavor && !entry)) return null;

  const sizeLabel = selection.size === "grande" ? "Grande" : "Broto";
  const scopeLabel = entry ? scopeLabels[entry.scope] : "Pizza artesanal";
  const builderImage = entry ? imageForEntry(entry) : categoryImages[currentA.category][selection.size];
  const stepIndex = stepOrder.indexOf(step);
  const headerTitle = flavorPicker
    ? flavorPicker === "A"
      ? "Escolha o sabor"
      : "Escolha a segunda metade"
    : customizeView === "remove"
      ? "Retirar ingredientes"
      : customizeView === "addons"
        ? "Adicionais"
        : step === "pizza"
          ? initialSelection
            ? "Editar pizza"
            : "Monte sua pizza"
          : step === "customize"
            ? "Personalize"
            : "Revise seu pedido";
  const hasBack = Boolean(flavorPicker || customizeView || stepIndex > 0);

  return (
    <div className="fixed inset-0 z-[150] flex h-[100dvh] w-full bg-basso-paper sm:items-center sm:justify-center sm:bg-black/60 sm:p-4 sm:backdrop-blur-sm">
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-basso-paper sm:h-[min(900px,92dvh)] sm:max-w-4xl sm:rounded-[28px] sm:shadow-2xl">
        <header
          className="z-30 shrink-0 border-b border-black/5 bg-white/95 px-3 pb-2.5 backdrop-blur-xl sm:px-5 sm:pb-3.5"
          style={{ paddingTop: "max(.5rem, env(safe-area-inset-top))" }}
        >
          <div className="flex min-h-11 items-center gap-3">
            <button
              type="button"
              onClick={navigateBack}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/[.045] text-black active:scale-95"
              aria-label={hasBack ? "Voltar" : "Fechar"}
            >
              {hasBack ? <ArrowLeft size={20} /> : <X size={20} />}
            </button>
            <div className="min-w-0 flex-1">
              {!flavorPicker && !customizeView && (
                <p className="text-[9px] font-black uppercase tracking-[.14em] text-basso-wine">
                  Etapa {stepIndex + 1} de 3
                </p>
              )}
              <h2 className="truncate font-display text-xl font-black leading-tight sm:text-2xl">{headerTitle}</h2>
            </div>
            {!flavorPicker && (
              <div className="shrink-0 text-right">
                <span className="block text-[9px] font-bold uppercase tracking-wide text-black/30">Total</span>
                <strong className="text-base text-basso-wine sm:text-lg">{flavorChosen ? currency(total) : "—"}</strong>
              </div>
            )}
          </div>

          {!flavorPicker && !customizeView && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {stepOrder.map((item, index) => (
                <button
                  key={item}
                  type="button"
                  disabled={index > stepIndex}
                  onClick={() => index < stepIndex && setStep(item)}
                  className={`h-1.5 rounded-full transition ${index <= stepIndex ? "bg-basso-wine" : "bg-black/10"}`}
                  aria-label={stepLabels[item]}
                />
              ))}
            </div>
          )}
        </header>

        {flavorPicker ? (
          <FlavorPickerView
            flavorChosen={flavorChosen}
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
          />
        ) : (
          <>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
                {step === "pizza" && !customizeView && (
                  <PizzaStep
                    entry={entry}
                    scopeLabel={scopeLabel}
                    sizeLabel={sizeLabel}
                    builderImage={builderImage}
                    selection={selection}
                    currentA={currentA}
                    currentB={currentB}
                    onSize={changeSize}
                    onMass={(mass) => setSelection((current) => ({ ...current, mass }))}
                    onWhole={useWholePizza}
                    onHalfHalf={startHalfHalf}
                    onFlavorA={() => openFlavorPicker("A")}
                    onFlavorB={() => openFlavorPicker("B")}
                    flavorChosen={flavorChosen}
                  />
                )}

                {hasSweetFlavor && flavorChosen && !customizeView && <fieldset className="my-4 rounded-2xl border border-basso-gold/30 bg-basso-gold/10 p-4">
                  <legend className="px-1 text-sm font-bold">Opções da pizza doce</legend>
                  {pizzaOptions().hazelnut.active && <><p className="mb-3 text-xs text-black/60">A base original do sabor está inclusa. A base de {pizzaOptions().hazelnut.name} é opcional.</p>
                  <label className="mb-2 flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-white p-3 text-sm font-bold">
                    <span>Adicionar {pizzaOptions().hazelnut.name} <span className="whitespace-nowrap text-basso-wine">(+ {currency(pizzaOptions().hazelnut.price)})</span></span>
                    <input type="checkbox" checked={pricedSelection.sweetBase === "hazelnut-zero"} onChange={event => setSelection(current => ({ ...current, sweetBase: event.target.checked ? "hazelnut-zero" : "standard" }))}/>
                  </label></>}
                  <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-white p-3 text-sm font-semibold">
                    <span>Cortar a pizza doce <small className="block font-normal text-black/50">Sem corte por padrão para evitar vazamento do recheio.</small></span>
                    <input type="checkbox" checked={pricedSelection.cutPreference === "cut"} onChange={event => setSelection(current => ({ ...current, cutPreference: event.target.checked ? "cut" : "uncut" }))}/>
                  </label>
                </fieldset>}

                {step === "customize" && !customizeView && (
                  <CustomizeHub
                    removedCount={removedCount}
                    addonUnits={addonUnits}
                    currentA={currentA}
                    currentB={currentB}
                    selection={selection}
                    onOpenRemove={() => setCustomizeView("remove")}
                    onOpenAddons={() => setCustomizeView("addons")}
                  />
                )}

                {step === "customize" && customizeView === "remove" && (
                  <RemoveIngredientsView
                    currentA={currentA}
                    currentB={currentB}
                    selection={selection}
                    onToggle={toggleRemoved}
                  />
                )}

                {step === "customize" && customizeView === "addons" && (
                  <AddonsView
                    currentA={currentA}
                    currentB={currentB}
                    selection={selection}
                    addonUnits={addonUnits}
                    onChange={changeAddon}
                    onAskPlacement={setPendingPlacement}
                  />
                )}

                {step === "review" && !customizeView && (
                  <ReviewStep
                    selection={pricedSelection}
                    currentA={currentA}
                    currentB={currentB}
                    total={total}
                    onNotes={(notes) => setSelection((current) => ({ ...current, notes }))}
                    onEditPizza={() => setStep("pizza")}
                    onEditCustomize={() => setStep("customize")}
                  />
                )}

                {error && (
                  <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3.5 text-sm font-semibold leading-relaxed text-red-700">
                    {error}
                  </p>
                )}
              </div>
            </div>

            <footer
              className="z-30 shrink-0 border-t border-black/5 bg-white/95 px-4 pt-3 backdrop-blur-xl sm:px-6"
              style={{ paddingBottom: "max(.75rem, env(safe-area-inset-bottom))" }}
            >
              <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
                {customizeView ? (
                  <button
                    type="button"
                    className="btn-primary min-h-14 w-full rounded-2xl text-base"
                    onClick={() => {
                      if (customizeView === "addons" && missingPlacementId) {
                        setPendingPlacement(missingPlacementId);
                        setError("Defina onde vai este adicional.");
                        return;
                      }
                      setCustomizeView(null);
                      setError("");
                    }}
                  >
                    <Check size={19} /> Concluir
                  </button>
                ) : step === "pizza" ? (
                  <button type="button" className="btn-primary min-h-14 w-full rounded-2xl text-base" onClick={goToCustomize}>
                    {flavorChosen ? "Continuar" : "Escolher sabor"} <ChevronRight size={19} />
                  </button>
                ) : step === "customize" ? (
                  <button type="button" className="btn-primary min-h-14 w-full rounded-2xl text-base" onClick={goToReview}>
                    Revisar pedido <ChevronRight size={19} />
                  </button>
                ) : (
                  <button type="button" className="btn-primary min-h-14 w-full rounded-2xl text-base shadow-lg shadow-basso-wine/15" onClick={add} disabled={!total}>
                    <ShoppingBag size={19} />
                    <span>{initialSelection ? "Salvar alterações" : "Adicionar à sacola"}</span>
                    <strong className="ml-auto">{currency(total)}</strong>
                  </button>
                )}
              </div>
            </footer>
          </>
        )}

        {pendingPlacement && (
          <PlacementQuestion
            addonId={pendingPlacement}
            currentA={currentA}
            currentB={currentB}
            selection={selection}
            onChoose={(placement) => choosePlacement(pendingPlacement, placement)}
            onCancel={() => {
              if (!selection.addonPlacements?.[pendingPlacement]) {
                setSelection((current) => ({
                  ...current,
                  addons: { ...current.addons, [pendingPlacement]: 0 },
                }));
              }
              setPendingPlacement(null);
              setError("");
            }}
          />
        )}
      </div>
    </div>
  );
}

function PizzaStep({
  entry,
  scopeLabel,
  sizeLabel,
  builderImage,
  selection,
  currentA,
  currentB,
  onSize,
  onMass,
  onWhole,
  onHalfHalf,
  onFlavorA,
  onFlavorB,
  flavorChosen = true,
}: {
  entry: PizzaMenuEntry | null;
  scopeLabel: string;
  sizeLabel: string;
  builderImage: string;
  selection: PizzaSelection;
  currentA: Flavor;
  currentB?: Flavor;
  onSize: (size: PizzaSelection["size"]) => void;
  onMass: (mass: PizzaSelection["mass"]) => void;
  onWhole: () => void;
  onHalfHalf: () => void;
  onFlavorA: () => void;
  onFlavorB: () => void;
  flavorChosen?: boolean;
}) {
  const isHalfHalf = Boolean(currentB);


  return (
    <div className="space-y-5">
      <div className="hidden overflow-hidden rounded-3xl bg-basso-black sm:grid sm:grid-cols-[170px_1fr]">
        <div className="relative min-h-32">
          <Image src={builderImage} alt={`${scopeLabel} ${sizeLabel}`} fill className="object-cover" />
        </div>
        <div className="flex flex-col justify-center p-5 text-white">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-basso-goldLight">{scopeLabel}</p>
          <p className="mt-1 font-display text-2xl font-black">{flavorChosen ? `${currentA.name}${currentB ? ` + ${currentB.name}` : ""}` : `Pizza ${sizeLabel}`}</p>
        </div>
      </div>

      <section>
        <p className="mb-2 text-[10px] font-black uppercase tracking-[.14em] text-black/35">Tamanho e massa</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {entry ? (
            <div className="flex min-h-12 items-center justify-between rounded-2xl border border-black/8 bg-white px-4">
              <span className="text-sm font-semibold text-black/45">Tamanho</span>
              <strong className="text-sm text-basso-wine">{sizeLabel}</strong>
            </div>
          ) : (
            <SegmentedControl
              options={[{ id: "grande", label: "Grande" }, { id: "broto", label: "Broto" }]}
              value={selection.size}
              onChange={(value) => onSize(value as PizzaSelection["size"])}
            />
          )}
          <SegmentedControl
            options={activeMasses().map((mass) => ({ id: mass.id, label: mass.price ? `${mass.name} (+ ${currency(mass.price)})` : mass.name }))}
            value={selection.mass}
            onChange={(value) => onMass(value as PizzaSelection["mass"])}
          />
        </div>
      </section>

      <section>
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-basso-wine">Sabores</p>
        <h3 className="mt-1 font-display text-2xl font-black leading-tight">Escolha do seu jeito</h3>
        <p className="mt-1 text-xs leading-relaxed text-black/45">Toque no sabor para trocar. As categorias servem como filtro e não impedem combinações.</p>

        {(
          <div className="mt-3 grid grid-cols-2 gap-2">
            <ModeButton active={!isHalfHalf} title="1 sabor" subtitle="Pizza inteira" onClick={onWhole} />
            <ModeButton active={isHalfHalf} title="Meio a meio" subtitle="50% + 50%" onClick={onHalfHalf} />
          </div>
        )}
        {selection.size === "broto" && <p className="mt-2 text-xs text-basso-wine">Meio a meio: dois sabores salgados ou dois doces. Não é permitido misturar doce com salgado na Broto.</p>}

        <div className="mt-3 space-y-2">
          {!flavorChosen ? (
            <button type="button" onClick={onFlavorA} className="flex min-h-20 w-full items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-basso-wine/40 bg-white px-4 py-4 text-left transition hover:border-basso-wine">
              <span>
                <span className="block text-[10px] font-black uppercase tracking-[.14em] text-basso-wine">{selection.size === "broto" ? "Sabor da Broto" : "Pizza inteira"}</span>
                <span className="mt-1 block font-display text-xl font-black">Escolha o sabor</span>
                <span className="mt-0.5 block text-xs text-black/45">Toque para ver os sabores disponíveis</span>
              </span>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-basso-wine text-xl font-black text-white">+</span>
            </button>
          ) : <FlavorSelectionCard
            slotLabel={isHalfHalf ? "Metade 1" : selection.size === "broto" ? "Sabor da Broto" : "Pizza inteira"}
            flavor={currentA}
            size={selection.size}
            half={isHalfHalf}
            onClick={onFlavorA}
          />}
          {isHalfHalf && currentB && (
            <FlavorSelectionCard slotLabel="Metade 2" flavor={currentB} size={selection.size} half onClick={onFlavorB} />
          )}
        </div>

        {selection.size === "grande" && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-black/[.025] p-3 text-[11px] leading-relaxed text-black/45">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-basso-cream font-black text-basso-wine">½</span>
            <span>No meio a meio, o preço é calculado com <strong>50% de cada sabor</strong>.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function CustomizeHub({
  removedCount,
  addonUnits,
  currentA,
  currentB,
  selection,
  onOpenRemove,
  onOpenAddons,
}: {
  removedCount: number;
  addonUnits: number;
  currentA: Flavor;
  currentB?: Flavor;
  selection: PizzaSelection;
  onOpenRemove: () => void;
  onOpenAddons: () => void;
}) {
  const selectedAddons = catalog.addons.filter((addon) => (selection.addons[addon.id] || 0) > 0);

  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[.14em] text-basso-wine">Opcional</p>
      <h3 className="mt-1 font-display text-2xl font-black">Quer personalizar?</h3>
      <p className="mt-1 text-xs leading-relaxed text-black/45">Você pode retirar ingredientes ou incluir adicionais. Se não quiser alterar nada, é só continuar.</p>

      <div className="mt-5 space-y-2.5">
        <OptionCard
          title="Retirar ingredientes"
          subtitle={removedCount ? `${removedCount} ingrediente(s) removido(s)` : `Ajustar ${currentA.name}${currentB ? ` e ${currentB.name}` : ""}`}
          badge={removedCount ? `${removedCount}` : undefined}
          onClick={onOpenRemove}
        />
        <OptionCard
          title="Adicionar extras"
          subtitle={addonUnits ? `${addonUnits} unidade(s) adicionada(s)` : "Escolha o extra e onde ele vai"}
          badge={addonUnits ? `${addonUnits}` : undefined}
          onClick={onOpenAddons}
        />
      </div>

      {selectedAddons.length > 0 && (
        <div className="mt-5 rounded-2xl border border-black/8 bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-[.13em] text-black/35">Adicionados</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedAddons.map((addon) => (
              <span key={addon.id} className="rounded-full bg-basso-cream px-3 py-1.5 text-[11px] font-bold text-basso-wine">
                {selection.addons[addon.id]}× {addon.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RemoveIngredientsView({
  currentA,
  currentB,
  selection,
  onToggle,
}: {
  currentA: Flavor;
  currentB?: Flavor;
  selection: PizzaSelection;
  onToggle: (half: "A" | "B", ingredient: string) => void;
}) {
  return (
    <div>
      <p className="text-sm leading-relaxed text-black/50">Toque apenas no que você quer retirar. O item marcado ficará riscado.</p>
      <div className="mt-4 space-y-4">
        <IngredientList
          title={currentB ? `Metade ${currentA.name}` : currentA.name}
          ingredients={currentA.ingredients}
          selected={selection.removedA}
          onToggle={(ingredient) => onToggle("A", ingredient)}
        />
        {currentB && (
          <IngredientList
            title={`Metade ${currentB.name}`}
            ingredients={currentB.ingredients}
            selected={selection.removedB}
            onToggle={(ingredient) => onToggle("B", ingredient)}
          />
        )}
      </div>
    </div>
  );
}

function AddonsView({
  currentA,
  currentB,
  selection,
  addonUnits,
  onChange,
  onAskPlacement,
}: {
  currentA: Flavor;
  currentB?: Flavor;
  selection: PizzaSelection;
  addonUnits: number;
  onChange: (id: string, delta: number) => void;
  onAskPlacement: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-md text-sm leading-relaxed text-black/50">Escolha o adicional. Ao adicionar pela primeira vez, você define se vai na pizza inteira ou em uma metade.</p>
        <span className="shrink-0 rounded-full bg-basso-cream px-3 py-1.5 text-xs font-black text-basso-wine">{addonUnits}/5</span>
      </div>

      <div className="mt-4 space-y-2">
        {catalog.addons.filter((addon) => addon.active).map((addon) => {
          const quantity = selection.addons[addon.id] || 0;
          const placement = selection.addonPlacements?.[addon.id];
          return (
            <div key={addon.id} className={`rounded-2xl border bg-white p-3.5 ${quantity ? "border-basso-wine/20" : "border-black/8"}`}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold leading-tight">{addon.name}</p>
                  <p className="mt-1 text-[11px] text-black/45">{currency(addon.price)} inteira • {currency(Math.round(addon.price / 2))} metade</p>
                  {quantity > 0 && (
                    <button
                      type="button"
                      onClick={() => onAskPlacement(addon.id)}
                      className={`mt-2 inline-flex min-h-8 items-center rounded-full px-2.5 text-[10px] font-black ${placement ? "bg-basso-cream text-basso-wine" : "bg-amber-50 text-amber-700"}`}
                    >
                      {placement ? placementLabel(placement, currentA, currentB) : "Definir onde vai"}
                    </button>
                  )}
                </div>
                <div className="flex h-12 shrink-0 items-center rounded-2xl border border-black/10 bg-basso-paper/60">
                  <button type="button" className="grid h-12 w-11 place-items-center disabled:opacity-25" disabled={!quantity} onClick={() => onChange(addon.id, -1)} aria-label={`Remover ${addon.name}`}>
                    <Minus size={17} />
                  </button>
                  <span className="w-7 text-center text-sm font-black">{quantity}</span>
                  <button type="button" className="grid h-12 w-11 place-items-center disabled:opacity-25" disabled={quantity >= 2 || addonUnits >= 5} onClick={() => onChange(addon.id, 1)} aria-label={`Adicionar ${addon.name}`}>
                    <Plus size={17} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewStep({
  selection,
  currentA,
  currentB,
  total,
  onNotes,
  onEditPizza,
  onEditCustomize,
}: {
  selection: PizzaSelection;
  currentA: Flavor;
  currentB?: Flavor;
  total: number;
  onNotes: (notes: string) => void;
  onEditPizza: () => void;
  onEditCustomize: () => void;
}) {
  const selectedAddons = catalog.addons.filter((addon) => (selection.addons[addon.id] || 0) > 0);

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-black/8 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.14em] text-basso-wine">Sua pizza</p>
            <h3 className="mt-1 font-display text-2xl font-black">{selection.size === "grande" ? "Grande" : "Broto"}</h3>
            <p className="mt-1 text-sm font-semibold text-black/55">{currentA.name}{currentB ? ` + ${currentB.name}` : ""}</p>
            <p className="mt-1 text-xs text-black/40">Massa: {massName(selection.mass)}</p>
          </div>
          <button type="button" className="rounded-full bg-basso-cream px-3 py-2 text-xs font-black text-basso-wine" onClick={onEditPizza}>Editar</button>
        </div>
      </section>

      {(selection.removedA.length > 0 || selection.removedB.length > 0 || selectedAddons.length > 0) && (
        <section className="rounded-3xl border border-black/8 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-black uppercase tracking-[.14em] text-black/35">Personalização</p>
            <button type="button" className="rounded-full bg-basso-cream px-3 py-2 text-xs font-black text-basso-wine" onClick={onEditCustomize}>Editar</button>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {selection.removedA.length > 0 && <p><strong>Sem em {currentA.name}:</strong> {selection.removedA.join(", ")}</p>}
            {currentB && selection.removedB.length > 0 && <p><strong>Sem em {currentB.name}:</strong> {selection.removedB.join(", ")}</p>}
            {selectedAddons.map((addon) => {
              const quantity = selection.addons[addon.id] || 0;
              const placement = selection.addonPlacements?.[addon.id] || "whole";
              return <p key={addon.id}><strong>+ {quantity}× {addon.name}</strong> • {placementLabel(placement, currentA, currentB)}</p>;
            })}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-black/8 bg-white p-4">
        <label htmlFor="pizza-notes" className="text-[9px] font-black uppercase tracking-[.14em] text-black/35">Observação para a cozinha</label>
        <textarea
          id="pizza-notes"
          className="textarea mt-2 min-h-28 text-base"
          maxLength={500}
          value={selection.notes}
          onChange={(event) => onNotes(event.target.value)}
          placeholder="Ex.: assar bem, cortar em 8 pedaços..."
        />
        <p className="mt-1 text-right text-[10px] text-black/30">{selection.notes.length}/500</p>
      </section>

      <div className="rounded-3xl bg-basso-wine p-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-white/70">Total da pizza</span>
          <strong className="font-display text-2xl font-black">{currency(total)}</strong>
        </div>
      </div>
    </div>
  );
}

function FlavorPickerView({
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
  flavorChosen = true,
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
  flavorChosen?: boolean;
}) {
  const selectedId = slot === "A" ? (flavorChosen ? currentA.id : undefined) : currentB?.id;
  const isHalf = slot === "B" || Boolean(currentB);

  return (
    <div className="min-h-0 flex flex-1 flex-col">
      <div className="shrink-0 border-b border-black/5 bg-basso-paper px-4 py-3 sm:px-6">
        {slot === "B" && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-basso-cream px-3 py-2.5 text-xs text-basso-wine">
            <span className="font-semibold">Metade 1</span>
            <strong className="truncate">{currentA.name}</strong>
          </div>
        )}
        <label className="relative block">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
          <input
            className="input h-12 pl-10 text-base"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Buscar sabor ou ingrediente"
            enterKeyHint="search"
            inputMode="search"
            autoComplete="off"
          />
        </label>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:-mx-6 sm:px-6">
          <CategoryChip active={category === "all"} onClick={() => onCategory("all")}>Todos</CategoryChip>
          {categories.map((item) => (
            <CategoryChip key={item} active={category === item} onClick={() => onCategory(item)}>{flavorCategoryLabels[item]}</CategoryChip>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6" style={{ WebkitOverflowScrolling: "touch" }}>
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
                className={`w-full rounded-2xl border p-3.5 text-left transition active:scale-[.995] ${selected ? "border-basso-wine bg-basso-wine/[.055] ring-1 ring-basso-wine/15" : "border-black/8 bg-white"}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${selected ? "bg-basso-wine text-white" : "bg-basso-cream text-basso-wine"}`}>
                    {selected ? <Check size={17} /> : <span className="h-3 w-3 rounded-full border-2 border-current opacity-45" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-[15px] font-black leading-tight">{item.name}</h4>
                      <strong className="shrink-0 text-sm text-basso-wine">{currency(contribution)}</strong>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-black/42">{item.ingredients.join(", ")}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-full bg-basso-cream px-2 py-0.5 text-[8px] font-black uppercase text-basso-wine">{flavorCategoryLabels[item.category]}</span>
                      {isHalf && <span className="text-[9px] font-bold text-black/30">50% do sabor</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {!results.length && (
          <div className="grid min-h-64 place-items-center p-6 text-center">
            <div>
              <Search className="mx-auto text-black/20" size={30} />
              <p className="mt-3 font-bold">Nenhum sabor encontrado</p>
              <p className="mt-1 text-xs text-black/40">Tente outro termo ou outra categoria.</p>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-black/5 bg-white px-4 pt-2 text-center" style={{ paddingBottom: "max(.65rem, env(safe-area-inset-bottom))" }}>
        <p className="text-[10px] leading-relaxed text-black/35">{results.length} sabor(es) neste filtro</p>
      </div>
    </div>
  );
}

function PlacementQuestion({
  addonId,
  currentA,
  currentB,
  selection,
  onChoose,
  onCancel,
}: {
  addonId: string;
  currentA: Flavor;
  currentB?: Flavor;
  selection: PizzaSelection;
  onChoose: (placement: AddonPlacement) => void;
  onCancel: () => void;
}) {
  const addon = catalog.addons.find((item) => item.id === addonId);
  if (!addon) return null;
  const quantity = selection.addons[addon.id] || 1;
  const wholePrice = addon.price * quantity;
  const halfPrice = Math.round(addon.price * quantity * 0.5);

  return (
    <div className="absolute inset-0 z-50 flex items-end bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-6">
      <div className="w-full rounded-t-[28px] bg-basso-paper px-4 pb-4 pt-3 shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:p-5" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/15 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.14em] text-basso-wine">{quantity}× {addon.name}</p>
            <h3 className="mt-1 font-display text-2xl font-black">Onde vai o adicional?</h3>
          </div>
          <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/5" onClick={onCancel} aria-label="Cancelar adicional"><X size={18} /></button>
        </div>
        <div className="mt-4 space-y-2">
          <PlacementChoice title="Na pizza inteira" subtitle={`+ ${currency(wholePrice)}`} onClick={() => onChoose("whole")} />
          <PlacementChoice
            title={currentB ? `Só na metade ${currentA.name}` : "Só em metade da pizza"}
            subtitle={`+ ${currency(halfPrice)}`}
            onClick={() => onChoose("halfA")}
          />
          {currentB && (
            <PlacementChoice title={`Só na metade ${currentB.name}`} subtitle={`+ ${currency(halfPrice)}`} onClick={() => onChoose("halfB")} />
          )}
        </div>
        <p className="mt-3 text-center text-[10px] leading-relaxed text-black/35">Adicional em uma metade custa 50% do valor correspondente.</p>
      </div>
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/[.035] p-1">
      {options.map((option) => (
        <button
          type="button"
          key={option.id}
          onClick={() => onChange(option.id)}
          className={`min-h-11 rounded-xl px-3 text-sm font-bold transition active:scale-[.98] ${value === option.id ? "bg-white text-basso-wine shadow-sm ring-1 ring-black/5" : "text-black/45"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ModeButton({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[64px] rounded-2xl border p-3 text-left transition active:scale-[.99] ${active ? "border-basso-wine bg-basso-wine text-white shadow-sm" : "border-black/10 bg-white text-black"}`}
    >
      <p className="text-[15px] font-black leading-tight">{title}</p>
      <p className={`mt-1 text-[10px] font-semibold ${active ? "text-white/70" : "text-black/40"}`}>{subtitle}</p>
    </button>
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
      className="w-full rounded-2xl border border-black/10 bg-white p-3.5 text-left shadow-sm transition active:scale-[.99] sm:hover:border-basso-wine/35 sm:hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[.13em] text-basso-wine">{slotLabel}</p>
          <h4 className="mt-0.5 truncate font-display text-xl font-black leading-tight">{flavor.name}</h4>
          <p className="mt-1 truncate text-[10px] leading-relaxed text-black/40">{flavor.ingredients.join(", ")}</p>
        </div>
        <div className="shrink-0 text-right">
          <strong className="block text-sm text-basso-wine">{half ? "50% • " : ""}{currency(shownPrice)}</strong>
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-black/35">Trocar <ChevronRight size={13} /></span>
        </div>
      </div>
    </button>
  );
}

function OptionCard({
  title,
  subtitle,
  badge,
  onClick,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[78px] w-full items-center gap-3 rounded-2xl border border-black/8 bg-white p-4 text-left transition active:scale-[.99]">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-black">{title}</p>
        <p className="mt-1 truncate text-[11px] text-black/42">{subtitle}</p>
      </div>
      {badge && <span className="grid h-8 min-w-8 place-items-center rounded-full bg-basso-wine px-2 text-xs font-black text-white">{badge}</span>}
      <ChevronRight size={19} className="shrink-0 text-black/30" />
    </button>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`min-h-10 shrink-0 rounded-full px-3.5 text-xs font-bold ${active ? "bg-basso-wine text-white" : "border border-black/10 bg-white text-black/55"}`}>
      {children}
    </button>
  );
}

function PlacementChoice({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-black/8 bg-white px-4 py-3 text-left active:scale-[.99]">
      <strong className="text-sm">{title}</strong>
      <span className="shrink-0 text-sm font-black text-basso-wine">{subtitle}</span>
    </button>
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
    <section className="rounded-2xl border border-black/8 bg-white p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-basso-wine">{title}</p>
        {selected.length > 0 && <span className="rounded-full bg-red-50 px-2 py-1 text-[9px] font-black text-red-700">{selected.length} retirado(s)</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {ingredients.map((ingredient) => {
          const removed = selected.includes(ingredient);
          return (
            <button
              type="button"
              key={ingredient}
              className={`min-h-10 rounded-full border px-3 py-2 text-xs font-semibold transition active:scale-[.98] ${removed ? "border-red-300 bg-red-50 text-red-700 line-through" : "border-black/10 bg-basso-paper/55 text-black/70"}`}
              onClick={() => onToggle(ingredient)}
            >
              {ingredient}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function placementLabel(placement: AddonPlacement, currentA: Flavor, currentB?: Flavor) {
  if (placement === "whole") return "Pizza inteira";
  if (placement === "halfA") return currentB ? `Metade ${currentA.name}` : "Metade da pizza";
  return currentB ? `Metade ${currentB.name}` : "Metade da pizza";
}


