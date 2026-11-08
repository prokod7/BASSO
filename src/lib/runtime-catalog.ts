import { catalog } from "@/lib/catalog";
import { pizzaTotal, addonPrice } from "@/lib/pricing";
import { applyPizzaOptions, pizzaSurcharges } from "@/lib/pizza-options";
import { bestPizzaPromotion } from "@/lib/promotions";
import type { PromotionRecord, PizzaSelection } from "@/types";
import type { Addon, Flavor } from "@/types";

let promotions: PromotionRecord[] = [];
export function applyRuntimeCatalog(menu: {
  flavors?: Flavor[];
  addons?: Addon[];
  promotions?: unknown[];
  pizzaOptions?: unknown;
}) {
  if (menu.pizzaOptions !== undefined) applyPizzaOptions(menu.pizzaOptions);
  promotions = (menu.promotions || []) as PromotionRecord[];
  if (menu.flavors)
    catalog.flavors.splice(0, catalog.flavors.length, ...[...menu.flavors].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })));
  if (menu.addons)
    catalog.addons.splice(0, catalog.addons.length, ...menu.addons);
}

export function runtimePizzaTotal(selection: PizzaSelection) {
  const base = pizzaTotal(selection);
  const extras =
    addonPrice(selection.addons, catalog.addons, selection.addonPlacements || {}) +
    pizzaSurcharges(selection as PizzaSelection & { sweetBase?: string }).total;
  return (
    bestPizzaPromotion(promotions, selection, base, extras)?.promoUnitPrice ??
    base
  );
}
