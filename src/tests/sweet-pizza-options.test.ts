import { describe, expect, it } from "vitest";
import { catalog } from "@/lib/catalog";
import { pizzaTotal, SWEET_HAZELNUT_ZERO_SURCHARGE, validatePizzaSelection } from "@/lib/pricing";
import type { PizzaSelection } from "@/types";

type SweetPizzaSelection = PizzaSelection & {
  sweetBase?: "standard" | "hazelnut-zero";
  cutPreference?: "uncut" | "cut";
};

function pizza(flavorA: string): SweetPizzaSelection {
  return {
    size: "grande",
    mass: "traditional",
    flavorA,
    removedA: [],
    removedB: [],
    addons: {},
    addonPlacements: {},
    notes: "",
  };
}

describe("MU11 • pizzas doces e promoção", () => {
  it("cobra R$ 25,00 quando a Base Creme de Avelã Zero é selecionada", () => {
    const standard = pizza("brigadeiro");
    const hazelnutZero = { ...standard, sweetBase: "hazelnut-zero" as const, cutPreference: "uncut" as const };

    expect(pizzaTotal(hazelnutZero) - pizzaTotal(standard)).toBe(SWEET_HAZELNUT_ZERO_SURCHARGE);
    expect(SWEET_HAZELNUT_ZERO_SURCHARGE).toBe(2500);
  });

  it("aceita corte ou não corte em pizza doce", () => {
    expect(() => validatePizzaSelection({ ...pizza("brigadeiro"), cutPreference: "uncut" } as SweetPizzaSelection)).not.toThrow();
    expect(() => validatePizzaSelection({ ...pizza("brigadeiro"), cutPreference: "cut" } as SweetPizzaSelection)).not.toThrow();
  });

  it("não aceita metadados de pizza doce em pizza salgada", () => {
    expect(() => validatePizzaSelection({ ...pizza("mozzarella"), sweetBase: "hazelnut-zero", cutPreference: "uncut" } as SweetPizzaSelection)).toThrow(/pizza doce/i);
  });

  it("mantém a promoção somente em Calabresa Tradicional e Mozzarella", () => {
    expect(catalog.combo.options.grandeFlavors).toEqual(["calabresa-tradicional", "mozzarella"]);
    expect(catalog.combo.price).toBe(7999);
  });
});
