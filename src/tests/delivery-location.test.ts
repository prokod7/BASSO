import { describe, expect, it } from "vitest";
import { findDeliveryZone, normalizeDistrictName } from "@/lib/delivery-zones";
import { mapReverseGeocodeAddress } from "@/lib/geocoding";

describe("MU12 • entrega e localização", () => {
  it("normaliza bairro ignorando acentos, caixa e prefixo Bairro", () => {
    expect(normalizeDistrictName("  Bairro Jardim Santa Tereza  ")).toBe("jardim santa tereza");
    expect(normalizeDistrictName("JARDIM SANTA TERÊZA")).toBe("jardim santa tereza");
  });

  it("encontra a zona por bairro normalizado", () => {
    const zones = [
      { name: "Zona 1", districts: ["Jardim Santa Tereza"], fee_cents: 800, minimum_order_cents: 0, active: true },
    ];
    expect(findDeliveryZone(zones, "Bairro Jardim Santa Terêza")?.fee_cents).toBe(800);
  });

  it("não encontra zona inativa", () => {
    const zones = [
      { name: "Zona 1", districts: ["Centro"], fee_cents: 500, minimum_order_cents: 0, active: false },
    ];
    expect(findDeliveryZone(zones, "Centro")).toBeUndefined();
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
