import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enabled } from "@/lib/whatsapp/config";
import { secretMatches } from "@/lib/whatsapp/domain";
import { inboxBody, parseWebhook } from "@/lib/whatsapp/provider";
import { processQueue } from "@/lib/whatsapp/worker";

export const runtime = "nodejs";
export const maxDuration = 180;
type Context = { params: Promise<{ secret: string }> };

// URL privada de alta entropia + validação estrita de WABA/número + token na verificação GET.
async function allowed(context: Context) {
  return secretMatches((await context.params).secret, process.env.WHATSAPP_WEBHOOK_SECRET ?? "");
}

export async function GET(request: Request, context: Context) {
  if (!(await allowed(context))) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  if (url.searchParams.get("hub.mode") !== "subscribe" || !secretMatches(url.searchParams.get("hub.verify_token") ?? "", process.env.WHATSAPP_VERIFY_TOKEN ?? ""))
    return new Response("Forbidden", { status: 403 });
  return new Response(url.searchParams.get("hub.challenge") ?? "");
}

export async function POST(request: Request, context: Context) {
  if (!(await allowed(context))) return new Response("Not found", { status: 404 });
  if (Number(request.headers.get("content-length")) > 256000) return new Response("Too large", { status: 413 });
  let body;
  try {
    const reader = request.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 256000) { await reader.cancel(); return new Response("Too large", { status: 413 }); }
      chunks.push(value);
    }
    body = parseWebhook(JSON.parse(Buffer.concat(chunks).toString()), process.env.WHATSAPP_WABA_ID ?? "", process.env.WHATSAPP_PHONE_NUMBER_ID ?? "");
  } catch {
    return new Response("Invalid event", { status: 400 });
  }
  const db = createAdminClient();
  if (!db) return new Response("Persistence unavailable", { status: 503 });
  try {
    for (const entry of body.entry)
      for (const change of entry.changes) {
        const value = change.value;
        for (const status of value.statuses ?? []) {
          if (!["delivered", "read"].includes(status.status)) continue;
          // Entregue/lido pode chegar duplicado ou antes da resposta HTTP do envio.
          let query = db.from("wa_jobs").update({ delivered_at: new Date(Number(status.timestamp) * 1000).toISOString() }).is("delivered_at", null);
          query = status.biz_opaque_callback_data && /^[0-9a-f-]{36}$/i.test(status.biz_opaque_callback_data) ? query.eq("id", status.biz_opaque_callback_data) : query.eq("outbound_id", status.id);
          const { error } = await query;
          if (error) throw error;
        }
        for (const status of value.statuses ?? []) {
          const before: Record<string, string[]> = { delivered: ["sent"], read: ["sent", "delivered"], failed: ["sent"] };
          if (!before[status.status]) continue;
          const { error } = await db.from("wa_messages").update({ status: status.status }).eq("wa_id", status.id).in("status", before[status.status]);
          if (error) throw error;
        }
        const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
        // A caixa de entrada guarda toda mensagem, mesmo com o robô desligado.
        for (const message of value.messages ?? []) {
          const { error } = await db.rpc("wa_log_message", { p: message.from, m: message.id, body: inboxBody(message), kind: message.type, direction: "in", author: "customer", contact: names.get(message.from) ?? null, sent_at: new Date(Number(message.timestamp) * 1000).toISOString() });
          if (error) throw error;
        }
        for (const echo of value.message_echoes ?? []) {
          const { error: logError } = await db.rpc("wa_log_message", { p: echo.to, m: echo.id, body: inboxBody(echo), kind: echo.type ?? "text", direction: "out", author: "agent", contact: null, sent_at: new Date(Number(echo.timestamp) * 1000).toISOString() });
          if (logError) throw logError;
          // Atendente respondeu pelo celular: o robô sai da conversa.
          const { error } = await db.rpc("wa_receive", { p: echo.to, m: echo.id, b: echo, echo: true });
          if (error) throw error;
        }
        if (!enabled()) continue;
        const { data: settings, error: settingsError } = await db.from("wa_settings").select("enabled").eq("id", true).maybeSingle();
        if (settingsError) throw settingsError;
        if (!settings?.enabled) continue;
        for (const message of value.messages ?? []) {
          if (Number(message.timestamp) * 1000 > Date.now() + 300000) continue;
          const { error } = await db.rpc("wa_receive", { p: message.from, m: message.id, b: message, echo: false });
          if (error) throw error;
        }
      }
  } catch {
    return new Response("Persistence unavailable", { status: 503 });
  }
  // Espera o cliente parar de digitar e responde tudo junto. Sobras (queda/tempo) são retomadas
  // pelo próximo evento do webhook ou pelo painel aberto na loja (/api/whatsapp/kick).
  if (!enabled()) return new Response("OK");
  after(async () => {
    try { await processQueue({ budgetMs: 90000 }); } catch { console.error("whatsapp_worker_failed"); }
  });
  return new Response("OK");
}
