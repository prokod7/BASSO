import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enabled } from "./config";
import { waPhone } from "./domain";
import { sendMessage } from "./provider";

const WINDOW_MS = 24 * 3600000;

/** Texto ao cliente para os status que avisam (null = não avisa). */
export function statusMessage(status: string, channel: string, number: number, name: string) {
  const first = name.trim().split(/\s+/)[0];
  const who = first ? `, ${first}` : "";
  // Avisa o cliente só quando sai para entrega ou quando a retirada fica pronta.
  if (status === "ready" && channel === "pickup") return `✅ Seu pedido nº ${number} está pronto para retirada${who}! Pode vir buscar 😊`;
  if (status === "out_for_delivery" && channel === "own_delivery") return `🛵 Seu pedido nº ${number} saiu para entrega${who}! Já já chega aí. Bom apetite 🍕`;
  return null;
}

/**
 * Chamado depois que a equipe muda o status do pedido. Só envia dentro da janela de 24 h
 * aberta pelo cliente no WhatsApp (fora dela a Meta exige modelo aprovado). Nunca lança:
 * a mudança de status já aconteceu.
 */
export async function notifyOrderStatus(orderId: string, status: string) {
  try {
    if (!enabled()) return;
    const db = createAdminClient();
    if (!db) return;
    const { data: settings } = await db.from("wa_settings").select("enabled").eq("id", true).maybeSingle();
    if (!settings?.enabled) return;
    const { data: order } = await db.from("orders").select("id,number,daily_number,channel,customer_name,customer_phone").eq("id", orderId).maybeSingle();
    if (!order?.customer_phone) return;
    const text = statusMessage(status, order.channel, Number(order.daily_number ?? order.number), order.customer_name || "");
    if (!text) return;
    const phone = waPhone(String(order.customer_phone));
    const { data: session } = await db.from("wa_sessions").select("id,last_inbound").eq("phone", phone).maybeSingle();
    if (!session?.last_inbound || Date.now() - Date.parse(session.last_inbound) > WINDOW_MS) return;
    const id = await sendMessage(phone, text, order.id);
    await db.rpc("wa_log_message", { p: phone, m: id, body: text, kind: "text", direction: "out", author: "bot", contact: null, sent_at: null });
  } catch {
    console.error("whatsapp_status_notify_failed", { orderId });
  }
}

/** Agenda o aviso depois da resposta da rota; fora de uma requisição Next, roda em segundo plano. */
export function scheduleStatusNotice(orderId: string, status: string) {
  try {
    after(() => notifyOrderStatus(orderId, status));
  } catch {
    void notifyOrderStatus(orderId, status);
  }
}
