import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Food99Adapter } from "@/lib/integrations/food99";
import { food99CredentialStatus } from "@/lib/integrations/food99/config";
import { FOOD99_OFFICIAL_DOCS_REQUIRED } from "@/lib/integrations/food99/official-contract";
import { redactIntegrationValue } from "@/lib/integrations/core/safe-log";

const root = path.resolve(__dirname, "..");
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Mega Update 06 - 99Food contract-first", () => {
  it("detecta credenciais sem expor os valores", () => {
    process.env.FOOD99_ENVIRONMENT = "test";
    process.env.FOOD99_APP_ID = "app-id-test";
    process.env.FOOD99_APP_SECRET = "very-secret";
    process.env.FOOD99_SHOP_ID = "shop-test";
    process.env.FOOD99_SHOP_TOKEN = "shop-token";
    process.env.FOOD99_APP_SHOP_ID = "basso_teste_001";
    const status = food99CredentialStatus();
    expect(status.configured).toBe(true);
    expect(status.config.environment).toBe("test");
    expect(status.config.appShopId).toBe("basso_teste_001");
    expect(status.fields.FOOD99_APP_SECRET).toBe("configured");
    expect(JSON.stringify(status.fields)).not.toContain("very-secret");
  });

  it("não marca a integração como operacional antes do contrato oficial", async () => {
    process.env.FOOD99_APP_ID = "app";
    process.env.FOOD99_APP_SECRET = "secret";
    process.env.FOOD99_SHOP_ID = "shop";
    process.env.FOOD99_SHOP_TOKEN = "token";
    const health = await new Food99Adapter().health();
    expect(health.ok).toBe(false);
    expect(health.detail).toMatch(/contrato oficial/i);
  });

  it("mantém explícitas todas as páginas oficiais ainda necessárias", () => {
    expect(FOOD99_OFFICIAL_DOCS_REQUIRED.length).toBeGreaterThanOrEqual(6);
    expect(FOOD99_OFFICIAL_DOCS_REQUIRED.join(" ")).toMatch(/autenticação/i);
    expect(FOOD99_OFFICIAL_DOCS_REQUIRED.join(" ")).toMatch(/webhook/i);
    expect(FOOD99_OFFICIAL_DOCS_REQUIRED.join(" ")).toMatch(/APIItemID/i);
  });

  it("remove endpoints e headers 99Food inventados do código", () => {
    const directory = path.join(root, "src/lib/integrations/food99");
    const files = fs.readdirSync(directory).filter((name) => name.endsWith(".ts"));
    const source = [fs.readFileSync(path.join(root, "src/lib/integrations/food99.ts"), "utf8"), ...files.map((name) => fs.readFileSync(path.join(directory, name), "utf8"))].join("\n");
    expect(source).not.toMatch(/x-99food-signature|x-99-signature|\/oauth\/token|\/orders\/\$\{/i);
  });

  it("mascara segredos de payloads de log", () => {
    const redacted = redactIntegrationValue({ APP_ID: "visible-id", appSecret: "secret", nested: { shopToken: "token", value: 12 } });
    expect(redacted).toEqual({ APP_ID: "visible-id", appSecret: "[REDACTED]", nested: { shopToken: "[REDACTED]", value: 12 } });
  });
});
