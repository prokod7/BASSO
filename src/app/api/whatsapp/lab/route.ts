import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { labReadiness } from "@/lib/whatsapp/config";
import { labMessages, labTurn } from "@/lib/whatsapp/lab";

export const runtime = "nodejs";
export const maxDuration = 90;
const MIGRATION_HINT = "Aplique a migration 043_whatsapp_bot.sql no Supabase para usar o Laboratório.";
const noStore = { "Cache-Control": "no-store" };

function failure(error: unknown) {
  const message = error instanceof z.ZodError ? "Dados inválidos." : error instanceof Error ? error.message : "Falha no Laboratório.";
  return NextResponse.json({ error: /wa_lab|does not exist|schema cache/i.test(message) ? MIGRATION_HINT : message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager"], "settings.manage");
    const id = request.nextUrl.searchParams.get("session");
    if (id) return NextResponse.json({ messages: await labMessages(z.string().uuid().parse(id)) }, { headers: noStore });
    const db = createAdminClient();
    if (!db) throw new Error("Supabase não configurado.");
    const [sessions, settings] = await Promise.all([
      db.from("wa_lab_sessions").select("id,title,pending,updated_at").order("updated_at", { ascending: false }).limit(50),
      db.from("wa_settings").select("quiet_seconds").eq("id", true).maybeSingle(),
    ]);
    if (sessions.error) throw sessions.error;
    return NextResponse.json({
      configuration: labReadiness(),
      quiet_seconds: settings.data?.quiet_seconds ?? 15,
      sessions: (sessions.data ?? []).map((s) => ({ id: s.id, title: s.title, updated_at: s.updated_at, pending: Boolean(s.pending) })),
    }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create") }),
  z.object({
    action: z.literal("send"),
    session: z.string().uuid(),
    texts: z.array(z.string().max(4000)).max(20),
    simulate_open: z.boolean().default(true),
    file: z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), data: z.string().max(4_000_000) }).optional(),
  }),
  z.object({ action: z.literal("delete"), session: z.string().uuid() }),
]);

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const db = createAdminClient();
    if (!db) throw new Error("Supabase não configurado.");
    if (body.action === "create") {
      const { count } = await db.from("wa_lab_sessions").select("id", { count: "exact", head: true });
      const { data, error } = await db.from("wa_lab_sessions").insert({ title: `Cliente teste ${(count ?? 0) + 1}`, owner_id: auth.userId === "demo" ? null : auth.userId }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ id: data.id });
    }
    if (body.action === "delete") {
      const { error } = await db.from("wa_lab_sessions").delete().eq("id", body.session);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (!labReadiness().ready) throw new Error("Cadastre OPENAI_API_KEY e OPENAI_WHATSAPP_MODEL na Vercel para testar o robô.");
    return NextResponse.json({ messages: await labTurn({ sessionId: body.session, texts: body.texts, file: body.file, simulateOpen: body.simulate_open }) });
  } catch (error) {
    return failure(error);
  }
}
