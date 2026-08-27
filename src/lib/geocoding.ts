import type { Address } from "@/types";

type NominatimAddress = Record<string, string | undefined>;

export type ReverseGeocodePayload = {
  display_name?: string;
  address?: NominatimAddress;
};

function stateCode(address: NominatimAddress): string {
  const explicit = address.state_code?.trim();
  if (explicit && explicit.length <= 3) return explicit.toUpperCase();
  const iso = address["ISO3166-2-lvl4"] || address["ISO3166-2-lvl6"];
  if (iso?.includes("-")) return iso.split("-").pop()!.toUpperCase();
  return "";
}

export function mapReverseGeocodeAddress(
  payload: ReverseGeocodePayload,
  latitude: number,
  longitude: number,
): Partial<Address> & { displayName?: string } {
  const source = payload.address || {};
  const cep = (source.postcode || "").replace(/\D/g, "").slice(0, 8);
  const street = source.road || source.pedestrian || source.residential || source.footway || source.path || "";
  const number = source.house_number || "";
  const district = source.suburb || source.neighbourhood || source.quarter || source.city_district || source.borough || "";
  const city = source.city || source.town || source.municipality || source.village || source.county || "";
  const state = stateCode(source);

  return {
    cep,
    street,
    number,
    district,
    city,
    state,
    latitude,
    longitude,
    displayName: payload.display_name,
  };
}
