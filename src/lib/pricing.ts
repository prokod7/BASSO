import type { Addon, ComboSelection, Flavor, PizzaSelection } from "@/types";
import { catalog } from "@/lib/catalog";

export class PricingError extends Error {
  constructor(message: string) { super(message); this.name = "PricingError"; }
}

export function flavorPrice(flavor: Flavor, size: PizzaSelection["size"]): number {
  return size === "grande" ? flavor.priceGrande : flavor.priceBroto;
}

export function validatePizzaSelection(selection: PizzaSelection, flavorList: Flavor[] = catalog.flavors, addonList: Addon[] = catalog.addons): void {
  if (!selection || !["grande","broto"].includes(selection.size)) throw new PricingError("Tamanho de pizza inválido.");
  if (!["traditional","integral"].includes(selection.mass)) throw new PricingError("Massa inválida.");
  if (!Array.isArray(selection.removedA) || !Array.isArray(selection.removedB) || !selection.addons || typeof selection.addons !== "object") throw new PricingError("Configuração de pizza inválida.");
  if (typeof selection.notes !== "string") throw new PricingError("Observação inválida.");
  const a = flavorList.find(flavor => flavor.id === selection.flavorA);
  if (!a || !a.active) throw new PricingError("Primeiro sabor indisponível.");
  if (selection.size === "broto" && selection.flavorB) throw new PricingError("Pizza Broto aceita somente um sabor.");
  if (selection.flavorB) {
    const b = flavorList.find(flavor => flavor.id === selection.flavorB);
    if (!b || !b.active) throw new PricingError("Segundo sabor indisponível.");
    if ((a.category === "premium" && b.category === "traditional") || (a.category === "traditional" && b.category === "premium")) {
      throw new PricingError("Sabores Premium não podem ser combinados com Tradicionais.");
    }
  }
  const totalAddonUnits = Object.values(selection.addons).reduce((sum, quantity) => sum + quantity, 0);
  if (totalAddonUnits > catalog.rules.maxAddonUnits) throw new PricingError("O limite é de 5 unidades de adicionais por pizza.");
  for (const [id, quantity] of Object.entries(selection.addons)) {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > catalog.rules.maxSameAddon) throw new PricingError("Cada adicional aceita no máximo 2 unidades.");
    const addon = addonList.find(item => item.id === id);
    if (quantity && (!addon || !addon.active)) throw new PricingError("Adicional inválido ou indisponível.");
  }
  if (selection.notes.length > catalog.rules.notesMaxLength) throw new PricingError("A observação aceita até 500 caracteres.");
  const allowedA = new Set(a.ingredients);
  if (selection.removedA.some(ingredient => !allowedA.has(ingredient))) throw new PricingError("Ingrediente inválido para o primeiro sabor.");
  if (!selection.flavorB && selection.removedB.length) throw new PricingError("Retirada da segunda metade sem segundo sabor.");
  if (selection.flavorB) {
    const b = flavorList.find(flavor => flavor.id === selection.flavorB)!;
    const allowedB = new Set(b.ingredients);
    if (selection.removedB.some(ingredient => !allowedB.has(ingredient))) throw new PricingError("Ingrediente inválido para o segundo sabor.");
  }
}

export function pizzaBasePrice(selection: PizzaSelection, flavorList: Flavor[] = catalog.flavors, addonList: Addon[] = catalog.addons): number {
  validatePizzaSelection(selection, flavorList, addonList);
  const a = flavorList.find(flavor => flavor.id === selection.flavorA)!;
  const priceA = flavorPrice(a, selection.size);
  if (!selection.flavorB) return priceA;
  const b = flavorList.find(flavor => flavor.id === selection.flavorB)!;
  const priceB = flavorPrice(b, selection.size);
  // Arredondamento uniforme em centavos: soma e divide por 2.
  return Math.round((priceA + priceB) / 2);
}

export function addonPrice(addons: Record<string, number>, list: Addon[] = catalog.addons): number {
  return Object.entries(addons).reduce((sum, [id, quantity]) => {
    const addon = list.find(item => item.id === id);
    if (!addon || !addon.active) throw new PricingError("Adicional inválido ou indisponível.");
    return sum + addon.price * quantity;
  }, 0);
}

export function pizzaTotal(selection: PizzaSelection, flavorList: Flavor[] = catalog.flavors, addonList: Addon[] = catalog.addons): number {
  return pizzaBasePrice(selection, flavorList, addonList) + addonPrice(selection.addons, addonList);
}

export function comboTotal(selection: ComboSelection, addonList: Addon[] = catalog.addons, comboPrice: number = catalog.combo.price, availableBeverages: string[] = catalog.combo.options.beverages): number {
  if (!selection || !["traditional","integral"].includes(selection.mass)) throw new PricingError("Massa inválida para o combo.");
  if (!["chocolate-ao-leite","creme-de-avela"].includes(selection.brigadeiroBase)) throw new PricingError("Base do brigadeiro inválida para o combo.");
  if (!selection.addons || typeof selection.addons !== "object") throw new PricingError("Adicionais inválidos para o combo.");
  const quantities = Object.values(selection.addons);
  const totalUnits = quantities.reduce((sum, quantity) => sum + quantity, 0);
  if (totalUnits > 5 || quantities.some(quantity => !Number.isInteger(quantity) || quantity > 2 || quantity < 0)) throw new PricingError("Adicionais do combo excedem os limites permitidos.");
  if (!catalog.combo.options.grandeFlavors.includes(selection.grandeFlavor)) throw new PricingError("Sabor de pizza Grande inválido para o combo.");
  if (!availableBeverages.includes(selection.beverage)) throw new PricingError("Refrigerante inválido ou indisponível para o combo.");
  return comboPrice + addonPrice(selection.addons, addonList);
}

export function cartSubtotal(items: Array<{ unitPrice: number; quantity: number }>): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}
