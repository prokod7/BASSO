/**
 * Opções da pizza editáveis pelo gestor (Configurações → Opções da pizza):
 * base de Creme de Avelã Zero das pizzas doces e os tipos de massa.
 * O mesmo valor é aplicado no servidor (preço oficial) e no site (prévia).
 */
export type MassId = "traditional" | "integral";
export type PizzaOptionItem = { name: string; price: number; active: boolean };
export type PizzaOptions = { hazelnut: PizzaOptionItem; masses: Record<MassId, PizzaOptionItem> };

export const MASS_IDS: MassId[] = ["traditional", "integral"];

export const DEFAULT_PIZZA_OPTIONS: PizzaOptions = {
  hazelnut: { name: "Creme de Avelã Zero", price: 2500, active: true },
  masses: {
    traditional: { name: "Tradicional de longa fermentação", price: 0, active: true },
    integral: { name: "Integral de longa fermentação", price: 0, active: true },
  },
};

function item(raw: unknown, fallback: PizzaOptionItem): PizzaOptionItem {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 80) : fallback.name;
  const price = Number.isInteger(value.price) && (value.price as number) >= 0 && (value.price as number) <= 100_000 ? value.price as number : fallback.price;
  const active = typeof value.active === "boolean" ? value.active : fallback.active;
  return { name, price, active };
}

export function normalizePizzaOptions(raw: unknown): PizzaOptions {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const masses = value.masses && typeof value.masses === "object" ? value.masses as Record<string, unknown> : {};
  const result: PizzaOptions = {
    hazelnut: item(value.hazelnut, DEFAULT_PIZZA_OPTIONS.hazelnut),
    masses: {
      traditional: item(masses.traditional, DEFAULT_PIZZA_OPTIONS.masses.traditional),
      integral: item(masses.integral, DEFAULT_PIZZA_OPTIONS.masses.integral),
    },
  };
  // Sempre precisa existir ao menos uma massa disponível.
  if (!result.masses.traditional.active && !result.masses.integral.active) result.masses.traditional.active = true;
  return result;
}

let current: PizzaOptions = normalizePizzaOptions(null);

export function applyPizzaOptions(raw: unknown) { current = normalizePizzaOptions(raw); }
export function pizzaOptions(): PizzaOptions { return current; }
export function activeMasses(): Array<{ id: MassId } & PizzaOptionItem> {
  return MASS_IDS.filter(id => current.masses[id].active).map(id => ({ id, ...current.masses[id] }));
}
export function defaultMass(): MassId { return activeMasses()[0]?.id || "traditional"; }
export function massName(id: string | undefined) {
  return id === "integral" || id === "traditional" ? current.masses[id].name : "Tradicional de longa fermentação";
}

/** Acréscimos da pizza (base de avelã e massa), em centavos. */
export function pizzaSurcharges(selection: { mass?: string; sweetBase?: string }) {
  const hazelnut = selection.sweetBase === "hazelnut-zero" ? current.hazelnut.price : 0;
  const mass = selection.mass === "integral" || selection.mass === "traditional" ? current.masses[selection.mass].price : 0;
  return { hazelnut, mass, total: hazelnut + mass };
}
