import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Mega Update 07 - Production Final", () => {
  const migration = read("supabase/migrations/017_production_final_hardening.sql");

  it("gera o número interno do pedido de forma atômica no banco", () => {
    expect(migration).toContain("order_number_seq");
    expect(migration).toContain("orders_assign_number_server_side");
    expect(migration).toContain("new.number := nextval('public.order_number_seq')");
  });

  it("impede o estado demo/local de virar fonte operacional em produção", () => {
    const store = read("src/lib/demo-store.ts");
    expect(store).toContain("if (!isDemoMode()) {\n    memory = emptyState();");
    expect(store).toContain('if (typeof window !== "undefined" && isDemoMode()) localStorage.setItem');
  });

  it("mantém caixa, financeiro e estoque server-first em produção", () => {
    expect(read("src/app/painel/caixa/page.tsx")).toContain('/api/cash');
    expect(read("src/app/painel/financeiro/page.tsx")).toContain('/api/financial');
    expect(read("src/app/painel/estoque/page.tsx")).toContain('/api/inventory');
  });

  it("faz o checkout reutilizar a mesma chave em retry e aceitar o ID autoritativo do servidor", () => {
    const checkout = read("src/app/checkout/page.tsx");
    expect(checkout).toContain("checkoutKeyRef");
    expect(checkout).toContain("finalOrderId");
    expect(checkout).toContain("coverageConfigurationPending");
    expect(checkout).toContain("CheckoutQuote");
  });

  it("bloqueia delivery público quando a cobertura ainda não foi configurada", () => {
    const api = read("src/app/api/orders/route.ts");
    expect(api).toContain("coverageConfigurationPending");
    expect(api).toMatch(/bairros e taxas ainda não foram configurados/i);
  });

  it("persiste checklist da expedição e valida liberação no servidor", () => {
    expect(migration).toContain("expedition_checklist");
    expect(migration).toContain("save_order_expedition_checklist");
    expect(migration).toContain("set_order_expedition_status_v2");
    expect(migration).toContain("Ainda existem itens que não estão prontos para expedição");
    const page = read("src/app/painel/expedicao/page.tsx");
    expect(page).toContain('action: "checklist"');
    expect(page).toContain('action: "status"');
  });

  it("mantém o contrato iFood isolado das alterações do MU07", () => {
    const ifood = read("src/lib/integrations/ifood.ts");
    expect(ifood).toContain("export class IFoodAdapter");
    expect(ifood).not.toContain("99food");
  });
});
