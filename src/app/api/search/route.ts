import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GlobalSearchResult } from "@/types";

function escapeLike(value: string) {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"]);
    const query = request.nextUrl.searchParams.get("q")?.trim() || "";
    if (query.length < 2) return NextResponse.json({ results: [] });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const term = escapeLike(query);
    const numeric = Number(query.replace(/\D/g, ""));
    const [orders, customers, tables, products, drivers, tasks, financial] = await Promise.all([
      db.from("orders").select("id,number,customer_name,customer_phone,status,channel,total_cents").or(Number.isFinite(numeric) && numeric > 0 ? `number.eq.${numeric},customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%` : `customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`).is("deleted_at", null).limit(8),
      db.from("customers").select("id,name,phone,email").or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`).limit(8),
      Number.isFinite(numeric) && numeric > 0 && numeric <= 15
        ? db.from("restaurant_tables").select("number,status,people_count,group_id").eq("number", numeric).limit(1)
        : Promise.resolve({ data: [], error: null }),
      db.from("products").select("id,name,category,price_cents,active").ilike("name", `%${term}%`).limit(8),
      db.from("drivers").select("id,name,phone,vehicle,available").or(`name.ilike.%${term}%,phone.ilike.%${term}%`).limit(8),
      db.from("operation_tasks").select("id,title,status,priority,due_at").ilike("title", `%${term}%`).limit(8),
      db.from("financial_entries").select("id,description,status,kind,amount_cents,due_date").ilike("description", `%${term}%`).is("deleted_at", null).limit(8),
    ]);
    const failed = [orders, customers, tables, products, drivers, tasks, financial].find((result) => result.error);
    if (failed?.error) throw failed.error;
    const results: GlobalSearchResult[] = [];
    for (const row of orders.data || []) results.push({ id: row.id, kind: "order", title: `Pedido #${row.number}`, subtitle: `${row.customer_name} • ${row.status} • ${(Number(row.total_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, href: `/painel/pedidos?order=${row.id}`, badge: row.channel });
    for (const row of customers.data || []) results.push({ id: row.id, kind: "customer", title: row.name, subtitle: `${row.phone}${row.email ? ` • ${row.email}` : ""}`, href: `/painel/clientes?query=${encodeURIComponent(row.name)}`, badge: "Cliente" });
    for (const row of tables.data || []) results.push({ id: String(row.number), kind: "table", title: `Mesa ${row.number}`, subtitle: `${row.status} • ${row.people_count || 0} pessoa(s)`, href: `/painel/salao?mesa=${row.number}`, badge: row.status === "free" ? "Livre" : "Em uso" });
    for (const row of products.data || []) results.push({ id: row.id, kind: "product", title: row.name, subtitle: `${row.category} • ${(Number(row.price_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, href: `/painel/cardapio?query=${encodeURIComponent(row.name)}`, badge: row.active ? "Ativo" : "Inativo" });
    for (const row of drivers.data || []) results.push({ id: row.id, kind: "driver", title: row.name, subtitle: `${row.phone} • ${row.vehicle || "Veículo não informado"}`, href: "/painel/delivery", badge: row.available ? "Disponível" : "Em entrega" });
    for (const row of tasks.data || []) results.push({ id: row.id, kind: "task", title: row.title, subtitle: `${row.status} • prioridade ${row.priority}`, href: "/painel/tarefas", badge: "Tarefa" });
    for (const row of financial.data || []) results.push({ id: row.id, kind: "financial", title: row.description, subtitle: `${row.kind} • ${(Number(row.amount_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} • ${row.status}`, href: "/painel/financeiro", badge: "Financeiro" });
    return NextResponse.json({ results: results.slice(0, 30) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na busca global." }, { status: 400 });
  }
}
