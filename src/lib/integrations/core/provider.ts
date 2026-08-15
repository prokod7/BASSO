export const MARKETPLACE_PROVIDERS = ["ifood", "99food"] as const;
export type MarketplaceProvider = (typeof MARKETPLACE_PROVIDERS)[number];

export function isMarketplaceProvider(value: string): value is MarketplaceProvider {
  return MARKETPLACE_PROVIDERS.includes(value as MarketplaceProvider);
}
