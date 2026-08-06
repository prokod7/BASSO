import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "counter"], "customers.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const query = (request.nextUrl.searchParams.get("q") || "").trim();
    const segment = request.nextUrl.searchParams.get("segment") || "all";
    const limit = Math.min(500, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 200)));

    let requestQuery = db.from("crm_customer_metrics").select("*").eq("active", true).order("last_order_at", { ascending: false, nullsFirst: false }).limit(limit);
    if (query) requestQuery = requestQuery.or(`name.ilike.%${query.replaceAll(",", " ")}%,phone.ilike.%${query.replaceAll(",", " ")}%`);
    if (["new", "active", "frequent", "inactive"].includes(segment)) requestQuery = requestQuery.eq("segment", segment);
    const { data, error } = await requestQuery;
    if (error) throw error;

    const customers = (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email || undefined,
      birthDate: row.birth_date || undefined,
      notes: row.notes || undefined,
      validOrders: Number(row.valid_orders || 0),
      totalSpent: Number(row.total_spent_cents || 0),
      averageTicket: Number(row.average_ticket_cents || 0),
      lastOrderAt: row.last_order_at || undefined,
      segment: row.segment,
      consents: { email: row.marketing_email, push: row.marketing_push, whatsapp: row.marketing_whatsapp }
    }));

    if (request.nextUrl.searchParams.get("format") === "csv") {
      const header = ["Nome", "Telefone", "E-mail", "Pedidos válidos", "Total gasto (centavos)", "Ticket médio (centavos)", "Último pedido", "Segmento", "E-mail consentido", "Push consentido", "WhatsApp consentido"];
      const rows = customers.map(customer => [customer.name, customer.phone, customer.email, customer.validOrders, customer.totalSpent, customer.averageTicket, customer.lastOrderAt, customer.segment, customer.consents.email, customer.consents.push, customer.consents.whatsapp]);
      const csv = "\ufeff" + [header, ...rows].map(row => row.map(csvEscape).join(";")).join("\r\n");
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="crm-la-forneria-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ customers, total: customers.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar CRM." }, { status: 400 });
  }
}
