import { describe, expect, it } from "vitest";
import { parseMoneyInput } from "@/lib/utils";
import { formatStoreAddress, normalizeSiteContent } from "@/lib/business-settings";
import { applySiteImages, categoryImages, defaultCategoryImages } from "@/lib/catalog";
import { menuIdFromName } from "@/lib/menu-ids";

describe("autonomia do administrador", () => {
  it("lê preços digitados em vários formatos", () => {
    expect(parseMoneyInput("55")).toBe(5500);
    expect(parseMoneyInput("55,9")).toBe(5590);
    expect(parseMoneyInput("1.234,50")).toBe(123450);
    expect(parseMoneyInput("12.5")).toBe(1250);
    expect(parseMoneyInput("R$ 7,00")).toBe(700);
    expect(parseMoneyInput("")).toBe(0);
  });

  it("aplica e remove fotos personalizadas das seções de pizza", () => {
    applySiteImages({ "traditional.grande": "https://x.supabase.co/a.jpg" });
    expect(categoryImages.traditional.grande).toBe("https://x.supabase.co/a.jpg");
    expect(categoryImages.premium.broto).toBe(defaultCategoryImages.premium.broto);
    applySiteImages({});
    expect(categoryImages.traditional.grande).toBe(defaultCategoryImages.traditional.grande);
  });

  it("aceita somente fotos https em chaves conhecidas e textos limitados", () => {
    const site = normalizeSiteContent({ heroTitle: "  Nova pizza  ", heroBadge: "", images: { hero: "https://x/h.jpg", "traditional.grande": "javascript:alert(1)", outra: "https://x/y.jpg" } });
    expect(site.heroTitle).toBe("Nova pizza");
    expect(site.heroBadge).toBeNull();
    expect(site.heroImage).toBe("https://x/h.jpg");
    expect(site.images).toEqual({ hero: "https://x/h.jpg" });
  });

  it("formata o endereço da loja", () => {
    expect(formatStoreAddress({ street: "Rua A", number: "10", district: "Centro", city: "Ribeirão Pires", state: "SP" })).toBe("Rua A, 10 — Centro — Ribeirão Pires/SP");
  });

  it("gera ids legíveis e únicos para itens novos", () => {
    const a = menuIdFromName("Frango com Catupiry®");
    expect(a).toMatch(/^frango-com-catupiry-[0-9a-f]{4}$/);
    expect(menuIdFromName("Frango com Catupiry®")).not.toBe(a);
  });
});
