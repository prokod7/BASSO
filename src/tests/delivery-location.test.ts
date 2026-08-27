import { describe, expect, it } from "vitest";
import { findDeliveryZone, normalizeCityName, normalizeDistrictName } from "@/lib/delivery-zones";
import { mapReverseGeocodeAddress } from "@/lib/geocoding";

describe("MU16 • entrega e localização", () => {
  it("normaliza bairro ignorando acentos, caixa e prefixo Bairro", () => {
    expect(normalizeDistrictName("  Bairro Jardim Santa Tereza  ")).toBe("jardim santa tereza");
    expect(normalizeDistrictName("JARDIM SANTA TERÊZA")).toBe("jardim santa tereza");
  });

  it("normaliza cidade ignorando acentos e caixa", () => {
    expect(normalizeCityName("RIBEIRÃO PIRES")).toBe("ribeirao pires");
    expect(normalizeCityName("  Mauá  ")).toBe("maua");
  });

  it("encontra a zona pela combinação cidade + bairro", () => {
    const zones = [
      { name: "Rio Grande da Serra — Centro", city: "Rio Grande da Serra", districts: ["Centro"], fee_cents: 500, minimum_order_cents: 0, active: true },
      { name: "Ribeirão Pires — Centro", city: "Ribeirão Pires", districts: ["Centro"], fee_cents: 1200, minimum_order_cents: 0, active: true },
    ];
    expect(findDeliveryZone(zones, "Bairro Centro", "Rio Grande da Serra")?.fee_cents).toBe(500);
    expect(findDeliveryZone(zones, "Centro", "RIBEIRÃO PIRES")?.fee_cents).toBe(1200);
  });

  it("não escolhe silenciosamente bairro homônimo quando a cidade não é informada", () => {
    const zones = [
      { name: "Cidade A — Centro", city: "Cidade A", districts: ["Centro"], fee_cents: 500, minimum_order_cents: 0, active: true },
      { name: "Cidade B — Centro", city: "Cidade B", districts: ["Centro"], fee_cents: 900, minimum_order_cents: 0, active: true },
    ];
    expect(findDeliveryZone(zones, "Centro")).toBeUndefined();
  });

  it("mantém compatibilidade segura quando o bairro existe em uma única cidade", () => {
    const zones = [
      { name: "Rio Grande da Serra — Vila Lavínia", city: "Rio Grande da Serra", districts: ["Vila Lavinia", "Vila Lavínia"], fee_cents: 600, minimum_order_cents: 0, active: true },
    ];
    expect(findDeliveryZone(zones, "Vila Lavínia")?.fee_cents).toBe(600);
  });

  it("não encontra zona inativa", () => {
    const zones = [
      { name: "Rio Grande da Serra — Centro", city: "Rio Grande da Serra", districts: ["Centro"], fee_cents: 500, minimum_order_cents: 0, active: false },
    ];
    expect(findDeliveryZone(zones, "Centro", "Rio Grande da Serra")).toBeUndefined();
  });

  it("mapeia o retorno do geocoder para o endereço do checkout", () => {
    const result = mapReverseGeocodeAddress({
      display_name: "Rua do Progresso, 407, Centro, Rio Grande da Serra, SP",
      address: {
        road: "Rua do Progresso",
        house_number: "407",
        suburb: "Centro",
        city: "Rio Grande da Serra",
        postcode: "09450-000",
        "ISO3166-2-lvl4": "BR-SP",
      },
    }, -23.744, -46.398);

    expect(result).toMatchObject({
      cep: "09450000",
      street: "Rua do Progresso",
      number: "407",
      district: "Centro",
      city: "Rio Grande da Serra",
      state: "SP",
      latitude: -23.744,
      longitude: -46.398,
    });
  });
});
