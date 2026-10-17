import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttentionItem, AttentionKind, AttentionSnapshot } from "@/types";

function minutesSince(value?: string | null) {
  if (!value) return undefined;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
}

export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"]);
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const activeStatuses = ["received", "confirmed", "preparing", "ready", "out_for_delivery"];
    const [ordersR, tablesR, stockR, printR, approvalsR, incidentsR, syncR, cashR] = await Promise.all([
      db.from("orders").select("id,number,daily_number,status,payment_status,channel,customer_name,created_at,estimated_ready_at,viewed_at,driver_id,total_cents").in("status", activeStatuses).is("deleted_at", null).order("created_at", { ascending: true }),
      db.from("restaurant_tables").select("number,status,opened_at").neq("status", "free").order("number"),
      db.from("inventory_items").select("id,product_id,quantity,minimum_quantity,products(name)").order("quantity"),
      db.from("print_jobs").select("id,order_id,sector,last_error,created_at,attempts").eq("status", "failed").order("created_at", { ascending: false }).limit(30),
      db.from("approval_requests").select("id,action_type,entity_type,entity_id,reason,requested_at").eq("status", "pending").order("requested_at", { ascending: true }).limit(30),
      db.from("order_incidents").select("id,order_id,severity,title,description,created_at").eq("status", "open").order("created_at", { ascending: true }).limit(50),
      db.from("sync_queue").select("id,entity_type,last_error,created_at,status").in("status", ["queued", "failed"]).order("created_at", { ascending: true }).limit(50),
      db.from("cash_sessions").select("id,status,opened_at").eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const failed = [ordersR, tablesR, stockR, printR, approvalsR, incidentsR, syncR, cashR].find((result) => result.error);
    if (failed?.error) throw failed.error;

    const items: AttentionItem[] = [];
    for (const row of ordersR.data || []) {
      const age = minutesSince(row.created_at) || 0;
      const etaLate = row.estimated_ready_at ? new Date(row.estimated_ready_at).getTime() < Date.now() : false;
      if (!row.viewed_at && row.status === "received") {
        items.push({ id: `unviewed:${row.id}`, kind: "order", severity: age >= 10 ? "danger" : "warning", title: `Pedido #${row.daily_number ?? row.number} ainda não foi visualizado`, detail: `${row.customer_name} • aguardando há ${age} min`, href: `/painel/pedidos?order=${encodeURIComponent(row.id)}`, createdAt: row.created_at, ageMinutes: age });
      }
      if (etaLate || age >= 60) {
        items.push({ id: `late:${row.id}`, kind: "order", severity: age >= 90 ? "danger" : "warning", title: `Pedido #${row.daily_number ?? row.number} está atrasado`, detail: `${row.status} • ${age} min desde a entrada`, href: `/painel/pedidos?order=${encodeURIComponent(row.id)}`, createdAt: row.created_at, ageMinutes: age });
      }
      if (row.payment_status !== "paid") {
        items.push({ id: `payment:${row.id}`, kind: "payment", severity: row.status === "ready" || row.status === "out_for_delivery" ? "warning" : "info", title: `Pagamento pendente no pedido #${row.daily_number ?? row.number}`, detail: `${row.payment_status} • ${(Number(row.total_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, href: `/painel/pedidos?order=${encodeURIComponent(row.id)}`, createdAt: row.created_at, ageMinutes: age });
      }
      if (row.channel === "own_delivery" && row.status === "ready" && !row.driver_id) {
        items.push({ id: `driver:${row.id}`, kind: "delivery", severity: age >= 60 ? "danger" : "warning", title: `Pedido #${row.daily_number ?? row.number} pronto e sem motoboy`, detail: "Atribua um motoboy para evitar espera na expedição.", href: "/painel/delivery", createdAt: row.created_at, ageMinutes: age });
      }
    }

    for (const row of tablesR.data || []) {
      const age = minutesSince(row.opened_at) || 0;
      if (age >= 120) items.push({ id: `table:${row.number}`, kind: "salon", severity: age >= 180 ? "warning" : "info", title: `Mesa ${row.number} aberta há ${age} min`, detail: `Situação atual: ${row.status}.`, href: `/painel/salao?mesa=${row.number}`, createdAt: row.opened_at || undefined, ageMinutes: age });
    }

    for (const row of stockR.data || []) {
      const qty = Number(row.quantity || 0);
      const min = Number(row.minimum_quantity || 0);
      if (qty <= min) {
        const product = Array.isArray(row.products) ? row.products[0] : row.products;
        const name = product && typeof product === "object" && "name" in product ? String(product.name) : String(row.product_id);
        items.push({ id: `stock:${row.id}`, kind: "stock", severity: qty <= 0 ? "danger" : "warning", title: qty <= 0 ? `${name} está sem estoque` : `${name} está abaixo do mínimo`, detail: `Atual ${qty} • mínimo ${min}`, href: "/painel/estoque" });
      }
    }

    for (const row of printR.data || []) items.push({ id: `print:${row.id}`, kind: "print", severity: Number(row.attempts || 0) >= 3 ? "danger" : "warning", title: `Falha de impressão (${row.sector})`, detail: row.last_error || `Pedido ${row.order_id || "sem vínculo"}`, href: "/painel/impressao", createdAt: row.created_at, ageMinutes: minutesSince(row.created_at) });
    for (const row of approvalsR.data || []) items.push({ id: `approval:${row.id}`, kind: "approval", severity: "warning", title: "Aprovação aguardando gestor", detail: `${row.action_type} • ${row.reason}`, href: "/painel/aprovacoes", createdAt: row.requested_at, ageMinutes: minutesSince(row.requested_at) });
    for (const row of incidentsR.data || []) items.push({ id: `incident:${row.id}`, kind: "incident", severity: row.severity === "critical" ? "danger" : row.severity === "high" ? "warning" : "info", title: row.title, detail: row.description || `Ocorrência no pedido ${row.order_id}`, href: `/painel/pedidos?order=${encodeURIComponent(row.order_id)}`, createdAt: row.created_at, ageMinutes: minutesSince(row.created_at) });
    for (const row of syncR.data || []) items.push({ id: `sync:${row.id}`, kind: "system", severity: row.status === "failed" ? "danger" : "warning", title: row.status === "failed" ? "Falha de sincronização" : "Operação aguardando sincronização", detail: row.last_error || row.entity_type, href: "/painel/continuidade", createdAt: row.created_at, ageMinutes: minutesSince(row.created_at) });
    if (!cashR.data) items.push({ id: "cash:closed", kind: "cash", severity: "warning", title: "Caixa está fechado", detail: "Abra o caixa antes de iniciar recebimentos presenciais.", href: "/painel/caixa" });

    const priority = { danger: 0, warning: 1, info: 2 } as const;
    items.sort((a, b) => priority[a.severity] - priority[b.severity] || (b.ageMinutes || 0) - (a.ageMinutes || 0));
    const kinds: AttentionKind[] = ["order", "payment", "delivery", "salon", "stock", "print", "cash", "approval", "incident", "system"];
    const snapshot: AttentionSnapshot = {
      generatedAt: new Date().toISOString(),
      totals: {
        all: items.length,
        danger: items.filter((item) => item.severity === "danger").length,
        warning: items.filter((item) => item.severity === "warning").length,
        info: items.filter((item) => item.severity === "info").length,
      },
      groups: Object.fromEntries(kinds.map((kind) => [kind, items.filter((item) => item.kind === kind).length])) as Record<AttentionKind, number>,
      items,
    };
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao montar a central de atenção." }, { status: 400 });
  }
}
