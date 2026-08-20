import { describe, expect, it } from "vitest";
import raw from "@/data/catalog.json";
import { catalog } from "@/lib/catalog";

describe("cardápio oficial", () => {
  it("preserva as quantidades oficiais e expõe as variações normalizadas", () => {
    expect(catalog.flavors.filter(item => item.category === "traditional")).toHaveLength(42);
    expect(catalog.flavors.filter(item => item.category === "premium")).toHaveLength(11);
    expect(catalog.flavors.filter(item => item.category === "sweet")).toHaveLength(11);
    expect(raw.beverages).toHaveLength(29);
    // O item genérico Del Valle do cadastro-fonte vira quatro sabores selecionáveis.
    expect(catalog.beverages).toHaveLength(32);
    expect(catalog.beverages.filter(item => item.id.startsWith("suco-del-valle-") && item.id !== "suco-del-valle-lata-290-ml")).toHaveLength(4);
    expect(catalog.beverages.some(item => item.id === "suco-del-valle-lata-290-ml")).toBe(false);
    expect(catalog.addons).toHaveLength(20);
    expect(catalog.desserts).toHaveLength(2);
    expect(catalog.combo.price).toBe(7999);
  });

  it("não possui IDs duplicados nem valores monetários fracionários", () => {
    for (const list of [catalog.flavors, catalog.addons, catalog.beverages, catalog.desserts]) {
      const ids = list.map(item => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const flavor of catalog.flavors) {
      expect(Number.isInteger(flavor.priceGrande)).toBe(true);
      expect(Number.isInteger(flavor.priceBroto)).toBe(true);
      expect(flavor.ingredients.length).toBeGreaterThan(0);
    }
  });

  it("mantém 15 mesas na capacidade aprovada", () => {
    expect(raw.tables).toHaveLength(15);
    expect(raw.tables.filter(table => table.capacity === 5)).toHaveLength(10);
    expect(raw.tables.filter(table => table.capacity === 2)).toHaveLength(5);
  });

  it("registra explicitamente a inexistência de bordas", () => {
    expect(raw.rules.borders).toBe(false);
    expect(JSON.stringify(raw).toLowerCase()).not.toContain('"border"');
  });
});
