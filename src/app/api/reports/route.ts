import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

function isoDate(value: string | null, fallback: Date) {
  if (!value) return fallback.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback.toISOString().slice(0, 10);
}
function csvEscape(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "finance", "viewer"]);
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = isoDate(request.nextUrl.searchParams.get("start"), monthStart);
    const end = isoDate(request.nextUrl.searchParams.get("end"), now);
    const startIso = `${start}T00:00:00.000Z`;
    const endIso = `${end}T23:59:59.999Z`;

    const [ordersResult, itemsResult, reviewsResult, financeResult] = await Promise.all([
      db.from("orders").select("id,number,channel,status,payment_status,payment_method,total_cents,discount_cents,delivery_fee_cents,created_at,completed_at,created_by,driver_id").is("deleted_at", null).gte("created_at", startIso).lte("created_at", endIso).order("created_at", { ascending: true }).limit(10000),
      db.from("order_items").select("order_id,kind,name_snapshot,quantity,unit_price_cents,selection,sector,production_status").gte("created_at", startIso).lte("created_at", endIso).limit(50000),
      db.from("order_reviews").select("rating,created_at").gte("created_at", startIso).lte("created_at", endIso).limit(10000),
      db.from("financial_entries").select("kind,status,amount_cents,due_date").is("deleted_at", null).gte("due_date", start).lte("due_date", end).limit(10000)
    ]);
    if (ordersResult.error) throw ordersResult.error;
    if (itemsResult.error) throw itemsResult.error;
    if (reviewsResult.error) throw reviewsResult.error;
    if (financeResult.error) throw financeResult.error;
    const orders = ordersResult.data || [];
    const valid = orders.filter((order: any) => order.status !== "cancelled");
    const paid = valid.filter((order: any) => order.payment_status === "paid");
    const revenue = paid.reduce((sum: number, order: any) => sum + order.total_cents, 0);
    const discounts = valid.reduce((sum: number, order: any) => sum + order.discount_cents, 0);
    const deliveryFees = valid.reduce((sum: number, order: any) => sum + order.delivery_fee_cents, 0);
    const averageTicket = paid.length ? Math.round(revenue / paid.length) : 0;

    const byChannel: Record<string, { orders: number; revenue: number }> = {};
    const byPayment: Record<string, { orders: number; revenue: number }> = {};
    const byDay: Record<string, { orders: number; revenue: number }> = {};
    for (const order of paid as any[]) {
      byChannel[order.channel] ||= { orders: 0, revenue: 0 };
      byChannel[order.channel].orders += 1; byChannel[order.channel].revenue += order.total_cents;
      byPayment[order.payment_method] ||= { orders: 0, revenue: 0 };
      byPayment[order.payment_method].orders += 1; byPayment[order.payment_method].revenue += order.total_cents;
      const day = order.created_at.slice(0, 10);
      byDay[day] ||= { orders: 0, revenue: 0 };
      byDay[day].orders += 1; byDay[day].revenue += order.total_cents;
    }

    const validOrderIds = new Set(valid.map((order: any) => order.id));
    const productMap: Record<string, { quantity: number; revenue: number }> = {};
    const addonMap: Record<string, number> = {};
    for (const item of (itemsResult.data || []) as any[]) {
      if (!validOrderIds.has(item.order_id)) continue;
      productMap[item.name_snapshot] ||= { quantity: 0, revenue: 0 };
      productMap[item.name_snapshot].quantity += Number(item.quantity);
      productMap[item.name_snapshot].revenue += Number(item.quantity) * Number(item.unit_price_cents);
      const addons = item.selection?.addons || {};
      for (const [id, quantity] of Object.entries(addons)) addonMap[id] = (addonMap[id] || 0) + Number(quantity);
    }
    const topProducts = Object.entries(productMap).map(([name, metrics]) => ({ name, ...metrics })).sort((a, b) => b.quantity - a.quantity).slice(0, 20);
    const topAddons = Object.entries(addonMap).map(([id, quantity]) => ({ id, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 20);
    const ratings = (reviewsResult.data || []).map((row: any) => Number(row.rating));
    const averageRating = ratings.length ? Number((ratings.reduce((sum: number, value: number) => sum + value, 0) / ratings.length).toFixed(2)) : null;
    const finance = (financeResult.data || []).filter((entry: any) => entry.status === "settled");
    const financialIncome = finance.filter((entry: any) => entry.kind === "income").reduce((sum: number, entry: any) => sum + entry.amount_cents, 0);
    const financialExpense = finance.filter((entry: any) => entry.kind === "expense").reduce((sum: number, entry: any) => sum + entry.amount_cents, 0);

    const report = {
      period: { start, end },
      summary: {
        orders: valid.length,
        paidOrders: paid.length,
        cancelledOrders: orders.length - valid.length,
        revenue,
        discounts,
        deliveryFees,
        averageTicket,
        averageRating,
        financialIncome,
        financialExpense,
        estimatedResult: financialIncome - financialExpense
      },
      byChannel,
      byPayment,
      byDay: Object.entries(byDay).map(([date, metrics]) => ({ date, ...metrics })),
      topProducts,
      topAddons
    };

    if (request.nextUrl.searchParams.get("format") === "csv") {
      const header = ["Número", "Data", "Canal", "Status", "Pagamento", "Forma", "Total (centavos)", "Desconto (centavos)", "Taxa entrega (centavos)"];
      const rows = orders.map((order: any) => [order.number, order.created_at, order.channel, order.status, order.payment_status, order.payment_method, order.total_cents, order.discount_cents, order.delivery_fee_cents]);
      const csv = "\ufeff" + [header, ...rows].map(row => row.map(csvEscape).join(";")).join("\r\n");
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="relatorio-la-forneria-${start}-${end}.csv"`, "Cache-Control": "no-store" } });
    }

    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao gerar relatório." }, { status: 400 });
  }
}
