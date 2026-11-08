import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole, type OperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { canSend, readiness } from "@/lib/whatsapp/config";
import { monthStart, usage } from "@/lib/whatsapp/domain";
import { sendMessage } from "@/lib/whatsapp/provider";

const WINDOW_MS = 24 * 3600000;
const MIGRATION_HINT = "Aplique a migration 043_whatsapp_bot.sql no Supabase para usar o WhatsApp.";
const VIEW: OperationalRole[] = ["manager", "counter", "viewer"];
const ATTEND: OperationalRole[] = ["manager", "counter"];
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(VIEW, "orders.view");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Acesso não autorizado." }, { status: 403 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const sessionId = request.nextUrl.searchParams.get("session");
  if (sessionId) {
    if (!z.string().uuid().safeParse(sessionId).success) return NextResponse.json({ error: "Conversa inválida." }, { status: 400 });
    const [session, messages] = await Promise.all([
      db.from("wa_sessions").select("id,phone,name,paused,last_inbound").eq("id", sessionId).maybeSingle(),
      db.from("wa_messages").select("id,direction,author,kind,body,status,created_at").eq("session_id", sessionId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(300),
    ]);
    if (session.error || messages.error || !session.data) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
    return NextResponse.json({ session: session.data, messages: (messages.data ?? []).reverse() }, { headers: noStore });
  }
  const [settings, inbox, stats, failures] = await Promise.all([
    db.from("wa_settings").select("enabled,quiet_seconds,max_wait_seconds,follow_up_seconds,pix_name").eq("id", true).maybeSingle(),
    db.rpc("wa_inbox"),
    db.from("wa_jobs").select("id", { count: "exact", head: true }).gte("delivered_at", monthStart()),
    db.from("wa_jobs").select("id,state,error,created_at").in("state", ["failed", "uncertain"]).order("created_at", { ascending: false }).limit(30),
  ]);
  if ([settings, inbox, stats, failures].some((r) => r.error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
  return NextResponse.json({
    configuration: readiness(),
    canSend: canSend(),
    enabled: settings.data?.enabled ?? false,
    quiet_seconds: settings.data?.quiet_seconds ?? 15,
    max_wait_seconds: settings.data?.max_wait_seconds ?? 90,
    follow_up_seconds: settings.data?.follow_up_seconds ?? 300,
    pix_name: settings.data?.pix_name ?? "",
    conversations: inbox.data ?? [],
    usage: usage(stats.count ?? 0),
    failures: failures.data ?? [],
  }, { headers: noStore });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("toggle"), enabled: z.boolean() }),
  z.object({
    action: z.literal("settings"),
    quiet_seconds: z.number().int().min(0).max(60),
    max_wait_seconds: z.number().int().min(0).max(120),
    follow_up_seconds: z.number().int().min(0).max(86400),
    pix_name: z.string().trim().max(120),
  }),
  z.object({ action: z.literal("session"), id: z.string().uuid(), paused: z.boolean() }),
  z.object({ action: z.literal("read"), id: z.string().uuid() }),
  z.object({ action: z.literal("send"), id: z.string().uuid(), text: z.string().trim().min(1).max(4000) }),
]);
const roles: Record<z.infer<typeof schema>["action"], { roles: OperationalRole[]; permission: string }> = {
  toggle: { roles: ["manager"], permission: "settings.manage" },
  settings: { roles: ["manager"], permission: "settings.manage" },
  session: { roles: ATTEND, permission: "orders.edit" },
  read: { roles: VIEW, permission: "orders.view" },
  send: { roles: ATTEND, permission: "orders.edit" },
};

export async function POST(request: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
    await requireOperationalRole(roles[body.action].roles, roles[body.action].permission);
  } catch (error) {
    const message = error instanceof z.ZodError ? "Dados inválidos." : error instanceof Error ? error.message : "Sem permissão.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  try {
    if (body.action === "toggle") {
      if (body.enabled && !readiness().enabled) return NextResponse.json({ error: "Defina WHATSAPP_BOT_ENABLED=true na Vercel para liberar o robô." }, { status: 400 });
      if (body.enabled && !readiness().ready) return NextResponse.json({ error: `Cadastre na Vercel: ${readiness().missing.join(", ")}.` }, { status: 400 });
      const { error } = await db.from("wa_settings").upsert({ id: true, enabled: body.enabled, updated_at: new Date().toISOString() });
      if (error) throw error;
    } else if (body.action === "settings") {
      if (body.max_wait_seconds < body.quiet_seconds) return NextResponse.json({ error: "A espera máxima precisa ser maior ou igual ao silêncio." }, { status: 400 });
      const { error } = await db.from("wa_settings").upsert({ id: true, quiet_seconds: body.quiet_seconds, max_wait_seconds: body.max_wait_seconds, follow_up_seconds: body.follow_up_seconds, pix_name: body.pix_name || null, updated_at: new Date().toISOString() });
      if (error) throw error;
    } else if (body.action === "session") {
      const { error } = body.paused ? await db.rpc("wa_agent_takeover", { sid: body.id }) : await db.rpc("wa_control_session", { sid: body.id, p: false });
      if (error) throw error;
    } else if (body.action === "read") {
      const { error } = await db.from("wa_sessions").update({ read_at: new Date().toISOString() }).eq("id", body.id);
      if (error) throw error;
    } else {
      if (!canSend()) return NextResponse.json({ error: "Conecte o número do WhatsApp (Dualhook) para responder por aqui." }, { status: 400 });
      const { data: session, error } = await db.from("wa_sessions").select("id,phone,last_inbound").eq("id", body.id).maybeSingle();
      if (error || !session) throw new Error("Conversa não encontrada.");
      if (!session.last_inbound || Date.now() - Date.parse(session.last_inbound) > WINDOW_MS)
        return NextResponse.json({ error: "Passaram 24 horas desde a última mensagem do cliente. O WhatsApp só libera nova conversa quando ele escrever de novo." }, { status: 400 });
      const outbound = await sendMessage(session.phone, body.text, randomUUID());
      const [logged, taken] = await Promise.all([
        db.rpc("wa_log_message", { p: session.phone, m: outbound, body: body.text, kind: "text", direction: "out", author: "agent", contact: null, sent_at: null }),
        // Uma pessoa respondeu: o robô sai desta conversa.
        db.rpc("wa_agent_takeover", { sid: session.id }),
      ]);
      if (logged.error || taken.error) throw new Error("Mensagem enviada, mas não registrada.");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: /wa_|does not exist|schema cache/i.test(message) ? MIGRATION_HINT : message || "Não foi possível concluir. Confira a conexão e tente novamente." }, { status: 400 });
  }
}
