import { describe, expect, it } from "vitest";
import { comboTotal, pizzaBasePrice, pizzaTotal, validatePizzaSelection } from "@/lib/pricing";
import { calculateAuthoritativeSubtotal } from "@/lib/server-orders";
import type { ComboSelection, PizzaSelection } from "@/types";

function pizza(overrides: Partial<PizzaSelection> = {}): PizzaSelection {
  return { size: "grande", mass: "traditional", flavorA: "mozzarella", removedA: [], removedB: [], addons: {}, notes: "", ...overrides };
}

describe("regras de pizza", () => {
  it("calcula meio a meio por metade de cada sabor, nunca pelo mais caro", () => {
    expect(pizzaBasePrice(pizza({ flavorA: "mozzarella", flavorB: "bella-italia" }))).toBe(5850);
  });

  it("permite dois sabores salgados na Broto", () => {
    expect(() => validatePizzaSelection(pizza({ size: "broto", flavorB: "calabresa-tradicional" }))).not.toThrow();
  });

  it("permite meio a meio entre Tradicional, Premium e Doce", () => {
    expect(() => validatePizzaSelection(pizza({ flavorB: "camarao" }))).not.toThrow();
    expect(() => validatePizzaSelection(pizza({ flavorB: "brigadeiro" }))).not.toThrow();
  });

  it("cobra adicional inteiro na pizza inteira e metade na metade escolhida", () => {
    expect(pizzaTotal(pizza({ addons: { bacon: 1 } }))).toBe(6000);
    expect(pizzaTotal(pizza({ addons: { bacon: 1 }, addonPlacements: { bacon: "halfA" } }))).toBe(5500);
  });

  it("limita repetição e total de adicionais", () => {
    expect(() => pizzaTotal(pizza({ addons: { bacon: 3 } }))).toThrow(/máximo 2/i);
    expect(() => pizzaTotal(pizza({ addons: { bacon: 2, tomate: 2, cebola: 2 } }))).toThrow(/limite é de 5/i);
  });

  it("valida retirada somente entre ingredientes do sabor", () => {
    expect(() => validatePizzaSelection(pizza({ removedA: ["camarão"] }))).toThrow(/Ingrediente inválido/i);
  });

  it("recompensa autorizada cobra somente adicionais", () => {
    const selection = pizza({ flavorA: "mozzarella", addons: { bacon: 1, tomate: 1 } });
    expect(calculateAuthoritativeSubtotal([{ id: "reward_1", kind: "reward", name: "Recompensa", quantity: 1, unitPrice: 1700, selection }], true)).toBe(1700);
    expect(() => calculateAuthoritativeSubtotal([{ id: "reward_1", kind: "reward", name: "Recompensa", quantity: 1, unitPrice: 1700, selection }], false)).toThrow(/autorização/i);
  });
});

describe("combo oficial", () => {
  const combo: ComboSelection = { mass: "integral", grandeFlavor: "mozzarella", brigadeiroBase: "chocolate-ao-leite", beverage: "guarana-antarctica-2-l", addons: {}, notes: "" };
  it("parte de R$ 79,99", () => expect(comboTotal(combo)).toBe(7999));
  it("cobra adicional integral", () => expect(comboTotal({ ...combo, addons: { bacon: 1 } })).toBe(8999));
  it("permite meio a meio do combo entre categorias diferentes", () => expect(() => comboTotal({ ...combo, grandeFlavorB: "camarao" })).not.toThrow());
});

