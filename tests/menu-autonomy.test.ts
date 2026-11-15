import { describe, it, expect, afterEach } from "vitest";
import { catalog } from "@/lib/catalog";
import { validatePizzaSelection, pizzaBasePrice } from "@/lib/pricing";
import { comboConfig, priceConfiguredCombo } from "@/lib/combos";
import { applyRuntimeCatalog, runtimePizzaTotal } from "@/lib/runtime-catalog";
import { storeStatus, type OpeningHours } from "@/lib/opening-hours";
import { bestPizzaPromotion, promotionIsActive } from "@/lib/promotions";
import type { PizzaSelection, ComboSelection, PromotionRecord } from "@/types";
const original = structuredClone(catalog.flavors),
  addons = structuredClone(catalog.addons);
afterEach(() =>
  applyRuntimeCatalog({
    flavors: structuredClone(original),
    addons: structuredClone(addons),
    promotions: [],
  }),
);
const pizza = (x: Partial<PizzaSelection> = {}): PizzaSelection => ({
  size: "broto",
  mass: "traditional",
  flavorA: "mozzarella",
  removedA: [],
  removedB: [],
  addons: {},
  notes: "",
  ...x,
});
const config = comboConfig({
  grandeFlavors: ["camarao", "caprese"],
  sweetFlavors: ["chocolate", "kinder-bueno"],
  sweetFlavor: "chocolate",
  beverages: ["coca-cola-2-l"],
  grandeQuantity: 2,
  sweetSize: "grande",
});
const combo: ComboSelection = {
  mass: "traditional",
  grandeFlavor: "camarao",
  grandeFlavorB: "caprese",
  secondGrandeFlavor: "caprese",
  sweetFlavor: "kinder-bueno",
  sweetSize: "grande",
  brigadeiroBase: "chocolate-ao-leite",
  beverage: "coca-cola-2-l",
  addons: {},
  notes: "",
};
describe("autonomia do cardápio", () => {
  it("broto salgada calcula 50% de cada sabor", () => {
    expect(pizzaBasePrice(pizza({ flavorB: "camarao" }))).toBe(
      Math.round(
        (original.find((f) => f.id === "mozzarella")!.priceBroto +
          original.find((f) => f.id === "camarao")!.priceBroto) /
          2,
      ),
    );
  });
  it.each([
    ["chocolate", "mozzarella"],
    ["mozzarella", "chocolate"],
  ])("bloqueia broto mista em qualquer ordem %s/%s", (flavorA, flavorB) =>
    expect(() => validatePizzaSelection(pizza({ flavorA, flavorB }))).toThrow(/Não misture doce com salgado/),
  );
  it("permite dois sabores doces na Broto", () => {
    expect(() => validatePizzaSelection(pizza({ flavorA: "chocolate", flavorB: "brigadeiro" }))).not.toThrow();
  });
  it("permite broto doce inteira e Grande meio a meio doce/salgada", () => {
    expect(() =>
      validatePizzaSelection(pizza({ flavorA: "chocolate" })),
    ).not.toThrow();
    expect(() =>
      validatePizzaSelection(pizza({ size: "grande", flavorB: "chocolate" })),
    ).not.toThrow();
  });
  it("troca nome, preço, ingredientes, novos IDs e pausas pelo retorno runtime", () => {
    const edited = {
      ...original[0],
      id: "novo-sabor",
      name: "Novo sabor",
      priceBroto: 1234,
      ingredients: ["novo ingrediente"],
    };
    applyRuntimeCatalog({ flavors: [edited], addons: [] });
    expect(runtimePizzaTotal(pizza({ flavorA: "novo-sabor" }))).toBe(1234);
    expect(catalog.flavors[0].ingredients).toEqual(["novo ingrediente"]);
    expect(() => validatePizzaSelection(pizza())).toThrow(/indisponível/);
  });
  it("combo 2 exige segunda pizza e cobra preço salvo", () => {
    expect(
      priceConfiguredCombo(combo, config, 26990, original, addons).total,
    ).toBe(26990);
    expect(() =>
      priceConfiguredCombo(
        { ...combo, secondGrandeFlavor: undefined },
        config,
        26990,
        original,
        addons,
      ),
    ).toThrow(/Sabor/);
  });
  it("não aceita sabor fora da lista nem doce na salgada", () => {
    expect(() =>
      priceConfiguredCombo(
        { ...combo, grandeFlavor: "mozzarella" },
        config,
        26990,
        original,
        addons,
      ),
    ).toThrow();
    expect(() =>
      priceConfiguredCombo(
        { ...combo, sweetFlavor: "brigadeiro" },
        config,
        26990,
        original,
        addons,
      ),
    ).toThrow();
  });
  it("componente pausado bloqueia combo e meio a meio respeita configuração", () => {
    expect(() =>
      priceConfiguredCombo(
        combo,
        config,
        26990,
        original.map((f) => ({ ...f, active: f.id !== "kinder-bueno" })),
        addons,
      ),
    ).toThrow();
    expect(() =>
      priceConfiguredCombo(
        combo,
        { ...config, allowHalfHalf: false },
        26990,
        original,
        addons,
      ),
    ).toThrow(/inteira/);
  });
  it("opções adicionais respeitam limites e metade existente", () => {
    expect(() =>
      priceConfiguredCombo(
        { ...combo, addons: { bacon: 3 } },
        config,
        26990,
        original,
        addons,
      ),
    ).toThrow();
    expect(() =>
      priceConfiguredCombo(
        {
          ...combo,
          grandeFlavorB: undefined,
          addons: { bacon: 1 },
          addonPlacements: { bacon: "halfB" },
        },
        config,
        26990,
        original,
        addons,
      ),
    ).toThrow(/Posicionamento/);
  });
});
describe("horário salvo, inclusive virada do dia", () => {
  const hours: OpeningHours = {
    sunday: null,
    monday: null,
    tuesday: ["18:00", "02:00"],
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
  };
  it("abre no início e mantém a janela da terça durante madrugada de quarta", () => {
    expect(storeStatus(new Date("2026-10-13T21:00:00Z"), hours).open).toBe(
      true,
    );
    expect(storeStatus(new Date("2026-10-14T04:00:00Z"), hours).open).toBe(
      true,
    );
    expect(storeStatus(new Date("2026-10-14T05:00:00Z"), hours).open).toBe(
      false,
    );
  });
  it("usa novo horário e respeita dias fechados", () => {
    expect(
      storeStatus(new Date("2026-10-15T15:00:00Z"), {
        ...hours,
        thursday: ["11:00", "15:00"],
      }).open,
    ).toBe(true);
    expect(storeStatus(new Date("2026-10-15T15:00:00Z"), hours).open).toBe(
      false,
    );
  });
});
describe("promoção por dia, canal e sabores", () => {
  const promo = {
    id: "tue",
    name: "Terça",
    promoPrice: 3999,
    active: true,
    paused: false,
    channels: ["pickup", "own_delivery"],
    daysOfWeek: [2],
    pizzaSize: "grande",
    targets: [
      { flavorId: "mozzarella" },
      { flavorId: "calabresa-tradicional" },
    ],
  } as PromotionRecord;
  it("não vaza para mesa, broto, outro dia ou sabor de fora", () => {
    expect(
      promotionIsActive(promo, "pickup", new Date("2026-10-13T22:00Z")),
    ).toBe(true);
    expect(
      promotionIsActive(promo, "dine_in", new Date("2026-10-13T22:00Z")),
    ).toBe(false);
    expect(
      promotionIsActive(promo, "pickup", new Date("2026-10-14T22:00Z")),
    ).toBe(false);
    expect(bestPizzaPromotion([promo], pizza(), 6000, 0)).toBeUndefined();
    expect(
      bestPizzaPromotion(
        [promo],
        pizza({ size: "grande", flavorB: "camarao" }),
        6000,
        0,
      ),
    ).toBeUndefined();
  });
  it("preço exibido preserva adicionais e aplica só às duas metades participantes", () => {
    applyRuntimeCatalog({ promotions: [promo] });
    expect(
      runtimePizzaTotal(
        pizza({
          size: "grande",
          flavorB: "calabresa-tradicional",
          addons: { bacon: 1 },
        }),
      ),
    ).toBe(4999);
  });
});

