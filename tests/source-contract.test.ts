import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("contrato técnico", () => {
  it("protege bordas e Broto também no banco", () => {
    const sql = read("supabase/migrations/001_core_schema.sql");
    expect(sql).toContain("no_border_payload");
    expect(sql).toContain("broto_single_flavor");
  });
  it("usa idempotência, histórico e RLS", () => {
    const sql = read("supabase/migrations/001_core_schema.sql");
    expect(sql).toContain("idempotency_keys");
    expect(sql).toContain("order_status_history");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("audit_no_update");
  });
  it("isola clientes de marketplace e QR de mesa do CRM", () => {
    const sql = read("supabase/migrations/011_public_table_qr_and_order_hardening.sql");
    expect(sql).toContain("not in ('ifood','99food','table_qr')");
  });
  it("possui filas atômicas de reprocessamento", () => {
    const sql = read("supabase/migrations/005_workers_and_queue_claims.sql");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("claim_integration_events");
    expect(sql).toContain("claim_print_jobs");
  });
  it("usa webhook oficial de pedidos do iFood sem exigir ID em cabeçalho", () => {
    const route = read("src/app/api/integrations/ifood/webhook/route.ts");
    expect(route).toContain("x-ifood-signature");
    expect(route).toContain("IFOOD_CLIENT_SECRET");
    expect(route).toContain("isIfoodKeepalive");
    expect(route).not.toContain("x-event-id");
  });
  it("abre ou reutiliza a comanda do QR dentro da transação", () => {
    const sql = read("supabase/migrations/011_public_table_qr_and_order_hardening.sql");
    expect(sql).toContain("v_channel='table_qr'");
    expect(sql).toContain("open_table_tab");
    expect(sql).toContain("Comanda da mesa não está mais aberta");
    expect(sql).toContain("resolvedTabId");
  });
  it("fecha pagamentos parciais e libera a mesa", () => {
    const sql = read("supabase/migrations/010_salon_groups_and_cash_payments.sql");
    expect(sql).toContain("record_tab_payment");
    expect(sql).toContain("v_open_count=0");
    expect(sql).toContain("status='free'");
  });
  it("não permite canais internos no checkout público", () => {
    const route = read("src/app/api/orders/route.ts");
    expect(route).toContain('"own_delivery", "pickup", "table_qr"');
    expect(route).toContain("Canal não permitido no checkout público");
    expect(route).toContain("Recompensas são lançadas exclusivamente");
  });
});
