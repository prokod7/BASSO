import { describe, expect, it } from "vitest";
import { districtForStreet, expandDistrict, streetKey } from "@/lib/whatsapp/streets";
import { matchDistrict, type Zone } from "@/lib/whatsapp/catalog";

const zones: Zone[] = [
  { name: "RGS", city: "Rio Grande da Serra", districts: ["Centro", "Jardim Santa Tereza", "Vila Conde Siciliano", "Parque do Governador", "Jardim Novo Horizonte", "Vila Figueiredo"], fee_cents: 500, minimum_order_cents: 0 },
  { name: "RP", city: "Ribeirão Pires", districts: ["Centro", "Pastoril", "Jardim Alvorada"], fee_cents: 800, minimum_order_cents: 0 },
];

describe("endereço pelo WhatsApp", () => {
  it("expande abreviações de rua e bairro", () => {
    expect(streetKey("R. Pref. Cido Franco")).toBe("prefeito cido franco");
    expect(streetKey("Av Dom Pedro I")).toBe(streetKey("Avenida Dom Pedro I"));
    expect(expandDistrict("Jd. Sta Tereza")).toBe("Jardim Santa Tereza");
    expect(expandDistrict("Jd. Alvorada")).toBe("jardim alvorada");
    expect(expandDistrict("vila conde")).toBe("Vila Conde Siciliano");
  });

  it("resolve as duas grafias do Parque Indaiá na mesma área e distingue cidades", () => {
    const area = { ...zones[0], districts: ["Parque Indaia", "Parque Indaiá"], fee_cents: 600 };
    const expected = { city: area.city, district: "Parque Indaia" };
    for (const input of ["Parque Indaiá", "parque indaia", "Pq. Indaiá"]) {
      expect(matchDistrict(input, "", [area])).toEqual(expected);
    }
    const both = [area, { ...area, city: "Ribeirão Pires" }];
    expect(() => matchDistrict("Parque Indaiá", "", both)).toThrow(/qual cidade/);
    expect(matchDistrict("Parque Indaiá", "Rio Grande da Serra", both)).toEqual(expected);
  });

  it("entende bairro abreviado", () => {
    expect(matchDistrict("Jd Sta Tereza", "", zones)).toEqual({ district: "Jardim Santa Tereza", city: "Rio Grande da Serra" });
    expect(matchDistrict("Vl Conde", "", zones).district).toBe("Vila Conde Siciliano");
    expect(matchDistrict("pq governador", "", zones).district).toBe("Parque do Governador");
  });

  it("descobre o bairro pela rua (diretório e ruas já entregues)", () => {
    expect(districtForStreet("R. José Maria de Figueiredo", "")).toMatchObject({ district: "Vila Figueiredo", city: "Rio Grande da Serra" });
    expect(districtForStreet("Rua Kaethe Richers", "")).toMatchObject({ district: "Pastoril" });
    expect(districtForStreet("Rua Inventada da Silva", "")).toBeNull();
    const learned = [{ street: "Rua do Progresso", district: "Centro", city: "Rio Grande da Serra", uses: 5 }];
    expect(districtForStreet("r do progresso", "", learned)).toMatchObject({ district: "Centro", city: "Rio Grande da Serra" });
  });
});
