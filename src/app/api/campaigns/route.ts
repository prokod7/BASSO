import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().min(2).max(120),
  channel: z.enum(["push", "email"]),
  segment: z.object({
    type: z.enum(["all", "new", "active", "frequent", "inactive", "birthday", "minimum_spend"]).default("all"),
    minimumSpend: z.number().int().nonnegative().optional()
  }),
  template: z.object({ title: z.string().min(2).max(120), message: z.string().min(2).max(2000), url: z.string().url().optional() }),
  scheduledAt: z.string().datetime().nullable().optional()
});

export async function GET() {
  try {
    await requireOperationalRole(["manager"]);
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.from("campaigns").select("*,campaign_recipients(count)").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    const ids = (data || []).map((row: any) => row.id);
    const { data: recipients, error: recipientsError } = ids.length ? await db.from("campaign_recipients").select("campaign_id,status,opened_at,converted_order_id").in("campaign_id", ids) : { data: [], error: null };
    if (recipientsError) throw recipientsError;
    const metrics = new Map<string, { recipients: number; sent: number; opened: number; converted: number }>();
    for (const row of recipients || []) {
      const metric = metrics.get(row.campaign_id) || { recipients: 0, sent: 0, opened: 0, converted: 0 };
      metric.recipients += 1;
      if (row.status === "sent" || row.status === "opened" || row.status === "converted") metric.sent += 1;
      if (row.opened_at) metric.opened += 1;
      if (row.converted_order_id) metric.converted += 1;
      metrics.set(row.campaign_id, metric);
    }
    const campaigns = (data || []).map((row: any) => ({ id: row.id, name: row.name, channel: row.channel, segment: row.segment, template: row.template, status: row.status, scheduledAt: row.scheduled_at || undefined, createdAt: row.created_at, metrics: metrics.get(row.id) || { recipients: 0, sent: 0, opened: 0, converted: 0 } }));
    return NextResponse.json({ campaigns }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar campanhas." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"]);
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const status = body.scheduledAt ? "scheduled" : "draft";
    const { data, error } = await db.from("campaigns").insert({ name: body.name, channel: body.channel, segment: body.segment, template: body.template, status, scheduled_at: body.scheduledAt || null, created_by: auth.userId === "demo" ? null : auth.userId }).select("id").single();
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "CAMPAIGN_CREATED", entity_type: "campaign", entity_id: data.id, after_data: body });
    return NextResponse.json({ id: data.id, status }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Campanha inválida." }, { status: 400 });
  }
}
