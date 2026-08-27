import { normalizeSearchText } from "@/lib/utils";

export type DeliveryZoneLike = {
  name: string;
  city?: string | null;
  districts: string[];
  fee_cents: number;
  minimum_order_cents: number;
  active?: boolean;
};

export function normalizeDistrictName(value: string): string {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^bairro\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCityName(value: string): string {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findDeliveryZone<T extends DeliveryZoneLike>(
  zones: T[],
  district: string,
  city?: string,
): T | undefined {
  const normalizedDistrict = normalizeDistrictName(district);
  const normalizedCity = normalizeCityName(city || "");
  if (!normalizedDistrict) return undefined;

  const districtMatches = zones.filter((zone) =>
    zone.active !== false &&
    (zone.districts || []).some((candidate) => normalizeDistrictName(candidate) === normalizedDistrict),
  );

  if (normalizedCity) {
    return districtMatches.find((zone) => normalizeCityName(zone.city || "") === normalizedCity);
  }

  // Compatibilidade segura para fluxos internos antigos: se o bairro existir em
  // apenas uma cidade, ainda é possível resolvê-lo. Bairro homônimo fica
  // propositalmente sem correspondência até a cidade ser informada.
  return districtMatches.length === 1 ? districtMatches[0] : undefined;
}
