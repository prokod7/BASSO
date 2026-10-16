"use client";

import { Check, Scissors, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PizzaBuilder, type PizzaMenuEntry } from "@/components/public/PizzaBuilder";
import { Modal } from "@/components/ui/Modal";
import { useCart } from "@/context/CartContext";
import { findFlavor } from "@/lib/catalog";
import { runtimePizzaTotal as pizzaTotal } from "@/lib/runtime-catalog";
import { SWEET_HAZELNUT_ZERO_SURCHARGE } from "@/lib/pricing";
import { currency } from "@/lib/utils";
import type { CartItem, Flavor, PizzaSelection } from "@/types";

type SweetBase = "standard" | "hazelnut-zero";
type CutPreference = "uncut" | "cut";
type SweetPizzaSelection = PizzaSelection & {
  sweetBase?: SweetBase;
  cutPreference?: CutPreference;
};

interface EnhancedPizzaBuilderProps {
  flavor?: Flavor | null;
  entry?: PizzaMenuEntry | null;
  open: boolean;
  onClose: () => void;
  onAdd?: (item: CartItem) => void;
  initialSelection?: PizzaSelection | null;
}

function hasSweetFlavor(selection: PizzaSelection) {
  const first = findFlavor(selection.flavorA);
  const second = selection.flavorB ? findFlavor(selection.flavorB) : undefined;
  return first?.category === "sweet" || second?.category === "sweet";
}

function decorateName(name: string, base: SweetBase, cut: CutPreference) {
  const clean = name
    .replace(/ • (?:NÃO CORTAR|CORTAR)/g, "")
    .replace(/ • Base Avelã Zero/g, "");
  return `${clean} • ${cut === "cut" ? "CORTAR" : "NÃO CORTAR"}${base === "hazelnut-zero" ? " • Base Avelã Zero" : ""}`;
}

export function EnhancedPizzaBuilder({
  flavor = null,
  entry = null,
  open,
  onClose,
  onAdd,
  initialSelection = null,
}: EnhancedPizzaBuilderProps) {
  const cart = useCart();
  const [pendingItem, setPendingItem] = useState<CartItem | null>(null);
  const [sweetBase, setSweetBase] = useState<SweetBase>("standard");
  const [cutPreference, setCutPreference] = useState<CutPreference>("uncut");
  const finalizingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setPendingItem(null);
      finalizingRef.current = false;
      return;
    }
    const source = initialSelection as SweetPizzaSelection | null;
    setSweetBase(source?.sweetBase === "hazelnut-zero" ? "hazelnut-zero" : "standard");
    setCutPreference(source?.cutPreference === "cut" ? "cut" : "uncut");
  }, [open, initialSelection]);

  const finalizedSelection = useMemo(() => {
    if (!pendingItem?.selection || !("flavorA" in pendingItem.selection)) return null;
    const selection = pendingItem.selection as SweetPizzaSelection;
    return {
      ...selection,
      sweetBase,
      cutPreference,
    } satisfies SweetPizzaSelection;
  }, [pendingItem, sweetBase, cutPreference]);

  const finalizedTotal = useMemo(() => {
    if (!finalizedSelection) return 0;
    try {
      return pizzaTotal(finalizedSelection);
    } catch {
      return 0;
    }
  }, [finalizedSelection]);

  const deliverItem = (item: CartItem) => {
    if (onAdd) onAdd(item);
    else cart.addItem(item);
  };

  const interceptAdd = (item: CartItem) => {
    const selection = item.selection as PizzaSelection | undefined;
    if (!selection || !hasSweetFlavor(selection)) {
      deliverItem(item);
      onClose();
      return;
    }

    const existing = selection as SweetPizzaSelection;
    setSweetBase(existing.sweetBase === "hazelnut-zero" ? "hazelnut-zero" : "standard");
    setCutPreference(existing.cutPreference === "cut" ? "cut" : "uncut");
    finalizingRef.current = true;
    setPendingItem(item);
  };

  const confirmSweetOptions = () => {
    if (!pendingItem || !finalizedSelection || !finalizedTotal) return;
    const nextItem: CartItem = {
      ...pendingItem,
      name: decorateName(pendingItem.name, sweetBase, cutPreference),
      unitPrice: finalizedTotal,
      selection: finalizedSelection,
    };
    deliverItem(nextItem);
    finalizingRef.current = false;
    setPendingItem(null);
    onClose();
  };

  const cancelAll = () => {
    finalizingRef.current = false;
    setPendingItem(null);
    onClose();
  };

  return (
    <>
      <PizzaBuilder
        flavor={flavor}
        entry={entry}
        open={open && !pendingItem}
        onClose={() => {
          if (!finalizingRef.current) onClose();
        }}
        onAdd={interceptAdd}
        initialSelection={initialSelection}
      />

      <Modal open={Boolean(open && pendingItem)} onClose={cancelAll} title="Finalizar pizza doce" className="sm:max-w-lg">
        <div className="space-y-5 p-5">
          <div className="rounded-2xl border border-basso-gold/30 bg-basso-gold/10 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 shrink-0 text-basso-wine" size={20} />
              <div>
                <p className="font-bold">Escolha a base</p>
                <p className="mt-1 text-xs leading-relaxed text-black/55">
                  A base original do sabor não tem acréscimo. O Creme de Avelã Zero é uma base adicional opcional.
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              <OptionButton active={sweetBase === "standard"} onClick={() => setSweetBase("standard")}>
                <span>Base original do sabor</span>
                <strong>Inclusa</strong>
              </OptionButton>
              <OptionButton active={sweetBase === "hazelnut-zero"} onClick={() => setSweetBase("hazelnut-zero")}>
                <span>Creme de Avelã Zero</span>
                <strong>+ {currency(SWEET_HAZELNUT_ZERO_SURCHARGE)}</strong>
              </OptionButton>
            </div>
          </div>

          <div className="rounded-2xl border border-black/8 bg-white p-4">
            <div className="flex items-start gap-3">
              <Scissors className="mt-0.5 shrink-0 text-basso-wine" size={20} />
              <div>
                <p className="font-bold">Como deseja receber a pizza?</p>
                <p className="mt-1 text-xs leading-relaxed text-black/55">
                  Pizzas doces vão sem corte por padrão para evitar que o recheio vaze durante o transporte.
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <OptionButton active={cutPreference === "uncut"} onClick={() => setCutPreference("uncut")}>
                <span>Não cortar</span>
                <strong>Recomendado</strong>
              </OptionButton>
              <OptionButton active={cutPreference === "cut"} onClick={() => setCutPreference("cut")}>
                <span>Cortar</span>
                <strong>A pedido</strong>
              </OptionButton>
            </div>
          </div>

          <button type="button" className="btn-primary min-h-12 w-full" onClick={confirmSweetOptions} disabled={!finalizedTotal}>
            Confirmar pizza • {currency(finalizedTotal)}
          </button>
        </div>
      </Modal>
    </>
  );
}

function OptionButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${active ? "border-basso-wine bg-basso-wine/5 text-basso-wine" : "border-black/10 bg-white text-black/65 hover:border-basso-wine/30"}`}
    >
      <span className="flex items-center gap-2 font-semibold">
        {active && <Check size={16} />}
        {children && Array.isArray(children) ? children[0] : children}
      </span>
      {Array.isArray(children) && children[1]}
    </button>
  );
}

