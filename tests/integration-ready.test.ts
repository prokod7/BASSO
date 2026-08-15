import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Mega Update 06 - fundação de integrações", () => {
  const migration = read("supabase/migrations/016_integration_ready_99food_tracking_smartpos.sql");

  it("separa rastreio interno do motoboy do link do cliente", () => {
    expect(migration).toContain("driver_shifts");
    expect(migration).toContain("customer_visible");
    expect(migration).toContain("record_driver_location_v2");
    expect(migration).toContain("sync_customer_tracking_visibility");
    expect(migration).toContain("alter column order_id drop not null");
  });

  it("permite a localização interna continuar sem pedido ativo durante o turno", () => {
    expect(migration).toMatch(/if p_order_id is not null then[\s\S]*Entrega não atribuída ao motoboy/);
    expect(migration).toMatch(/where driver_id=p_driver_id and status='active'/);
  });

  it("prepara dispositivo SmartPOS sem inventar contrato Rede", () => {
    expect(migration).toContain("registered_devices");
    expect(migration).toContain("waiter_smartpos");
    const rede = read("src/lib/integrations/rede.ts");
    expect(rede).toContain("requireRedeSmartPosContract");
    expect(rede).not.toMatch(/\/transactions|REDE_BASE_URL|REDE_TOKEN/);
  });

  it("libera somente o webhook exato da 99Food no middleware", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toContain('request.nextUrl.pathname === "/api/integrations/99food/webhook"');
    expect(middleware).toContain('"/painel/:path*"');
  });

  it("mantém o iFood separado do resolver da 99Food", () => {
    const worker = read("src/lib/workers/marketplace.ts");
    expect(worker).toContain('provider === "ifood"');
    expect(worker).toContain('event.provider === "99food"');
    expect(worker).toContain("resolveFood99OrderFromEvent");
  });
});
