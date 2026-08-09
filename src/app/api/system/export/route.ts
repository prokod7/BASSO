import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const allowedModules = new Set(["settings", "catalog", "customers", "orders", "salon", "inventory", "finance", "audit", "operation"]);

type ExportTable = { table: string; limit: number; order?: string };
const moduleTables: Record<string, ExportTable[]> = {
  settings: [
    { table: "business_settings", limit: 20 }, { table: "store_runtime_status", limit: 5 },
    { table: "delivery_zones", limit: 500 }, { table: "communication_templates", limit: 500 },
    { table: "print_profiles", limit: 100 },
  ],
  catalog: [
    { table: "categories", limit: 500 }, { table: "pizza_flavors", limit: 1000 },
    { table: "addons", limit: 1000 }, { table: "products", limit: 2000 }, { table: "price_history", limit: 5000 },
  ],
  customers: [
    { table: "customers", limit: 10000, order: "created_at" }, { table: "customer_addresses", limit: 20000 },
    { table: "loyalty_accounts", limit: 10000 }, { table: "loyalty_ledger", limit: 30000, order: "created_at" },
  ],
  orders: [
    { table: "orders", limit: 10000, order: "created_at" }, { table: "order_items", limit: 30000 },
    { table: "order_status_history", limit: 30000, order: "created_at" }, { table: "payments", limit: 20000, order: "created_at" },
    { table: "order_internal_notes", limit: 10000, order: "created_at" }, { table: "order_incidents", limit: 10000, order: "created_at" },
    { table: "order_communication_logs", limit: 20000, order: "created_at" },
  ],
  salon: [
    { table: "restaurant_tables", limit: 100 }, { table: "tabs", limit: 10000, order: "created_at" },
    { table: "tab_item_allocations", limit: 30000 },
  ],
  inventory: [
    { table: "inventory_items", limit: 2000 }, { table: "inventory_movements", limit: 30000, order: "created_at" },
    { table: "suppliers", limit: 1000 }, { table: "purchase_orders", limit: 5000, order: "created_at" },
    { table: "purchase_order_items", limit: 20000 },
  ],
  finance: [
    { table: "cash_sessions", limit: 5000, order: "opened_at" }, { table: "cash_movements", limit: 30000, order: "created_at" },
    { table: "financial_categories", limit: 1000 }, { table: "financial_entries", limit: 30000, order: "created_at" },
    { table: "payment_reconciliations", limit: 20000, order: "created_at" },
  ],
  audit: [{ table: "audit_logs", limit: 50000, order: "created_at" }],
  operation: [
    { table: "operational_checklist_runs", limit: 5000, order: "started_at" }, { table: "operational_checklist_run_items", limit: 30000 },
    { table: "operation_tasks", limit: 10000, order: "created_at" }, { table: "approval_requests", limit: 10000, order: "requested_at" },
    { table: "internal_notifications", limit: 20000, order: "created_at" }, { table: "system_migrations", limit: 200 },
  ],
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const requested = (request.nextUrl.searchParams.get("modules") || "settings,catalog,customers,orders,salon,inventory,finance,operation")
      .split(",").map((value) => value.trim()).filter((value) => allowedModules.has(value));
    const modules = [...new Set(requested.length ? requested : ["settings", "catalog"])];
    const data: Record<string, unknown[]> = {};
    const warnings: string[] = [];

    for (const moduleName of modules) {
      for (const descriptor of moduleTables[moduleName] || []) {
        let query = db.from(descriptor.table).select("*").limit(descriptor.limit);
        if (descriptor.order) query = query.order(descriptor.order, { ascending: false });
        const result = await query;
        if (result.error) {
          warnings.push(`${descriptor.table}: ${result.error.message}`);
          data[descriptor.table] = [];
        } else {
          data[descriptor.table] = result.data || [];
        }
      }
    }

    const manifest = {
      product: "PedidoPro - La Forneria Basso",
      formatVersion: 1,
      applicationVersion: "4.0.0",
      generatedAt: new Date().toISOString(),
      generatedBy: auth.displayName,
      modules,
      warnings,
      tableCounts: Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length])),
    };
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "OPERATIONAL_EXPORT_GENERATED", entity_type: "system", entity_id: manifest.generatedAt, after_data: { modules, tableCounts: manifest.tableCounts, warnings } });
    return NextResponse.json({ manifest, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao gerar exportação." }, { status: 400 });
  }
}
