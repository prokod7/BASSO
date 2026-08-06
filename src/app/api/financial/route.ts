import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  kind: z.enum(["income", "expense"]),
  description: z.string().min(2).max(200),
  categoryId: z.string().uuid().nullable().optional(),
  amount: z.number().int().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["pending", "settled"]).default("pending"),
  paymentMethod: z.enum(["pix", "cash", "debit", "credit", "meal_voucher", "food_voucher"]).nullable().optional(),
  recurring: z.boolean().default(false),
  notes: z.string().max(1000).optional()
});

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "finance"], "finance.view");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const start = request.nextUrl.searchParams.get("start");
    const end = request.nextUrl.searchParams.get("end");
    const status = request.nextUrl.searchParams.get("status");
    const kind = request.nextUrl.searchParams.get("kind");
    let query = db.from("financial_entries").select("*,financial_categories(name)").is("deleted_at", null).order("due_date", { ascending: false }).limit(500);
    if (start) query = query.gte("due_date", start);
    if (end) query = query.lte("due_date", end);
    if (["pending", "settled", "cancelled"].includes(status || "")) query = query.eq("status", status!);
    if (["income", "expense"].includes(kind || "")) query = query.eq("kind", kind!);
    const [entriesResult, categoriesResult] = await Promise.all([
      query,
      db.from("financial_categories").select("id,name,kind,active").eq("active", true).order("kind").order("name")
    ]);
    if (entriesResult.error) throw entriesResult.error;
    if (categoriesResult.error) throw categoriesResult.error;
    const entries = (entriesResult.data || []).map((row: any) => ({
      id: row.id, kind: row.kind, status: row.status, description: row.description,
      categoryId: row.category_id || undefined, categoryName: row.financial_categories?.name || "Sem categoria",
      amount: row.amount_cents, dueDate: row.due_date, settledAt: row.settled_at || undefined,
      paymentMethod: row.payment_method || undefined, recurring: row.recurring, notes: row.notes || undefined,
      createdAt: row.created_at
    }));
    const summary = entries.reduce((acc, entry) => {
      if (entry.status === "cancelled") return acc;
      const bucket = entry.status === "settled" ? "settled" : "pending";
      if (entry.kind === "income") acc[`${bucket}Income`] += entry.amount;
      else acc[`${bucket}Expense`] += entry.amount;
      return acc;
    }, { settledIncome: 0, settledExpense: 0, pendingIncome: 0, pendingExpense: 0 } as Record<string, number>);
    return NextResponse.json({ entries, categories: categoriesResult.data || [], summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar financeiro." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "finance"], "finance.view");
    const body = createSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const now = new Date().toISOString();
    const payload = {
      kind: body.kind,
      status: body.status,
      description: body.description,
      category_id: body.categoryId || null,
      amount_cents: body.amount,
      due_date: body.dueDate,
      settled_at: body.status === "settled" ? now : null,
      payment_method: body.status === "settled" ? body.paymentMethod || null : null,
      recurring: body.recurring,
      notes: body.notes || null,
      created_by: auth.userId === "demo" ? null : auth.userId,
      settled_by: body.status === "settled" && auth.userId !== "demo" ? auth.userId : null
    };
    const { data, error } = await db.from("financial_entries").insert(payload).select("id").single();
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "FINANCIAL_ENTRY_CREATED", entity_type: "financial_entry", entity_id: data.id, after_data: payload });
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lançamento inválido." }, { status: 400 });
  }
}
