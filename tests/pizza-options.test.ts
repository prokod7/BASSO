import { afterEach, describe, expect, it } from "vitest";
import { applyPizzaOptions, DEFAULT_PIZZA_OPTIONS, normalizePizzaOptions } from "@/lib/pizza-options";
import { pizzaTotal, PricingError } from "@/lib/pricing";
import { itemDetails } from "@/lib/item-presentation";
import type { PizzaSelection } from "@/types";

const sweet = { size: "grande", mass: "traditional", flavorA: "brigadeiro", removedA: [], removedB: [], addons: {}, notes: "", sweetBase: "standard", cutPreference: "uncut" } as PizzaSelection;
const savory = { size: "grande", mass: "traditional", flavorA: "mozzarella", removedA: [], removedB: [], addons: {}, notes: "" } as PizzaSelection;

afterEach(() => applyPizzaOptions(null));

describe("opções da pizza editáveis", () => {
  it("usa os valores padrão quando nada foi configurado", () => {
    expect(normalizePizzaOptions(undefined)).toEqual(DEFAULT_PIZZA_OPTIONS);
    expect(pizzaTotal({ ...sweet, sweetBase: "hazelnut-zero" } as PizzaSelection) - pizzaTotal(sweet)).toBe(2500);
  });

  it("cobra o valor configurado para a base de avelã", () => {
    applyPizzaOptions({ hazelnut: { name: "Nutella", price: 1800, active: true } });
    expect(pizzaTotal({ ...sweet, sweetBase: "hazelnut-zero" } as PizzaSelection) - pizzaTotal(sweet)).toBe(1800);
  });

  it("recusa a base quando ela está desativada", () => {
    applyPizzaOptions({ hazelnut: { name: "Nutella", price: 1800, active: false } });
    expect(() => pizzaTotal({ ...sweet, sweetBase: "hazelnut-zero" } as PizzaSelection)).toThrow(PricingError);
  });

  it("soma o acréscimo da massa e recusa massa desativada", () => {
    applyPizzaOptions({ masses: { integral: { name: "Integral", price: 500, active: true } } });
    expect(pizzaTotal({ ...savory, mass: "integral" }) - pizzaTotal(savory)).toBe(500);
    applyPizzaOptions({ masses: { integral: { name: "Integral", price: 0, active: false } } });
    expect(() => pizzaTotal({ ...savory, mass: "integral" })).toThrow(/indisponível/);
  });

  it("mantém ao menos uma massa disponível e usa os nomes configurados na comanda", () => {
    const options = normalizePizzaOptions({ masses: { traditional: { name: "Clássica", price: 0, active: false }, integral: { name: "Integral", price: 0, active: false } } });
    expect(options.masses.traditional.active).toBe(true);
    applyPizzaOptions({ masses: { traditional: { name: "Clássica 48h", price: 0, active: true } } });
    const lines = itemDetails({ selection: savory }).map(line => line.text);
    expect(lines).toContain("Massa: Clássica 48h");
  });
});
