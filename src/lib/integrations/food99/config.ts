import { maskedPresence } from "@/lib/integrations/core/safe-log";

export type Food99Environment = "test" | "production";

export interface Food99Config {
  environment: Food99Environment;
  appId: string;
  appSecret: string;
  shopId: string;
  shopToken: string;
  appShopId: string;
  apiBaseUrl?: string;
}

export function food99Config(): Food99Config {
  const environment = process.env.FOOD99_ENVIRONMENT === "production" ? "production" : "test";
  return {
    environment,
    appId: process.env.FOOD99_APP_ID?.trim() || process.env.FOOD99_CLIENT_ID?.trim() || "",
    appSecret: process.env.FOOD99_APP_SECRET?.trim() || process.env.FOOD99_CLIENT_SECRET?.trim() || "",
    shopId: process.env.FOOD99_SHOP_ID?.trim() || "",
    shopToken: process.env.FOOD99_SHOP_TOKEN?.trim() || "",
    appShopId: process.env.FOOD99_APP_SHOP_ID?.trim() || "basso_teste_001",
    apiBaseUrl: process.env.FOOD99_API_BASE_URL?.trim() || process.env.FOOD99_BASE_URL?.trim() || undefined,
  };
}

export function food99CredentialStatus() {
  const config = food99Config();
  const fields = {
    FOOD99_APP_ID: maskedPresence(config.appId),
    FOOD99_APP_SECRET: maskedPresence(config.appSecret),
    FOOD99_SHOP_ID: maskedPresence(config.shopId),
    FOOD99_SHOP_TOKEN: maskedPresence(config.shopToken),
    FOOD99_APP_SHOP_ID: maskedPresence(config.appShopId),
  } as const;
  const missing = Object.entries(fields).filter(([, status]) => status === "missing").map(([key]) => key);
  return { config, fields, missing, configured: missing.length === 0 };
}
