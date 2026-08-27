import { normalizeSearchText } from "@/lib/utils";

export type DeliveryZoneLike = {
  name: string;
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

export function findDeliveryZone<T extends DeliveryZoneLike>(zones: T[], district: string): T | undefined {
  const normalizedDistrict = normalizeDistrictName(district);
  if (!normalizedDistrict) return undefined;
  return zones.find((zone) =>
    zone.active !== false &&
    (zone.districts || []).some((candidate) => normalizeDistrictName(candidate) === normalizedDistrict),
  );
}
