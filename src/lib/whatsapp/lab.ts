import { createAdminClient } from "@/lib/supabase/admin";
import { confirmation, type Pending } from "./domain";
import { readReceipt } from "./media";
import { isPdfUrl } from "./menuMedia";
import { loadBotContext, quoteBasket } from "./order";
import { assistantTurn, checkReceipt, pendingAfter, pixRequest, PIX_UNAVAILABLE_REPLY, PRICE_CHANGED_REPLY, withoutPending } from "./turn";

/** Telefone fixo das conversas de teste. */
export const LAB_PHONE = "5511900000000";

export const TEST_ORDER_NOTE =
  "🧪 *Pedido de teste conferido.* No atendimento real ele seria registrado agora e iria para a cozinha e a impressão. No Laboratório nada é gravado em Pedidos, Caixa ou Financeiro.";

function db() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase não configurado no servidor.");
  return client;
}

export async function labMessages(sessionId: string) {
  const { data, error } = await db()
    .from("wa_lab_messages")
    .select("id,role,content,intent,usage,created_at")
    .eq("session_id", sessionId)
    .order("created_at")
    .order("id")
    .limit(400);
  if (error) throw new Error("Não foi possível carregar a conversa de teste.");
  return data as { id: string; role: "user" | "assistant"; content: string; intent: string | null; usage: unknown; created_at: string }[];
}

/**
 * Um turno do Laboratório com a atendente de produção: mesmo cardápio, preços, regras de
 * confirmação e conferência de comprovante. Pedidos confirmados são só conferidos (recotados),
 * nunca gravados.
 */
export async function labTurn(opts: { sessionId: string; texts: string[]; file?: { mime: string; data: string }; simulateOpen: boolean }) {
  const client = db();
  const texts = opts.texts.map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 4000)).slice(0, 20);
  if (!texts.length && !opts.file) throw new Error("Digite uma mensagem.");
  const { data: session, error } = await client.from("wa_lab_sessions").select("id,pending").eq("id", opts.sessionId).maybeSingle();
  if (error || !session) throw new Error("Conversa de teste não encontrada.");
  const previous = (await labMessages(session.id)).map((m) => ({ role: m.role, content: m.content }));
  const sent = opts.file ? [...texts, "📎 Comprovante enviado"] : texts;
  const base = Date.now();
  let stamp = base + sent.length;
  const { error: insertError } = await client.from("wa_lab_messages").insert(sent.map((content, i) => ({ session_id: session.id, role: "user", content, created_at: new Date(base + i).toISOString() })));
  if (insertError) throw new Error("Não foi possível registrar a mensagem.");
  let pending = (session.pending as Pending | null) ?? null;
  const reply = async (content: string, extra: { intent?: string; usage?: unknown } = {}) => {
    const { error: replyError } = await client.from("wa_lab_messages").insert({
      session_id: session.id, role: "assistant", content: content.slice(0, 16000), intent: extra.intent ?? null, usage: extra.usage ?? null,
      created_at: new Date((stamp = Math.max(Date.now(), stamp + 1))).toISOString(),
    });
    if (replyError) throw new Error("Não foi possível registrar a resposta.");
    previous.push({ role: "assistant", content });
  };
  const context = await loadBotContext(client);
  if (opts.simulateOpen) context.store = { ...context.store, open: true };
  /** Confirma sem gravar: recalcula e compara com o resumo, como o pedido real faria. */
  const verify = async (current: Pending) => {
    const { quote } = await quoteBasket(current.basket);
    if (quote.total !== current.quote.total) await reply(PRICE_CHANGED_REPLY, { intent: "price_changed" });
    else await reply(TEST_ORDER_NOTE, { intent: "order" });
  };

  // Mesma regra de produção: só confirma se nada mudou antes da confirmação.
  let rest = texts;
  const index = texts.findIndex((t) => confirmation(t, pending));
  if (index >= 0 && texts.slice(0, index).every((t) => confirmation(t, pending))) {
    rest = texts.slice(index + 1);
    previous.push(...texts.slice(0, index + 1).map((content) => ({ role: "user" as const, content })));
    const current = pending!;
    if (current.basket.paymentMethod === "pix") {
      if (context.pix.pix_key) {
        const request = pixRequest(current, context.pix);
        pending = request.pending;
        await reply(request.response, { intent: "pix" });
        for (const text of request.followUps) await reply(text, { intent: "pix" });
      } else {
        pending = null;
        await reply(PIX_UNAVAILABLE_REPLY, { intent: "pix" });
      }
    } else {
      pending = null;
      await verify(current);
    }
  }
  if (opts.file && pending?.awaiting_receipt) {
    const current = pending;
    const file = opts.file;
    previous.push({ role: "user", content: "[comprovante do Pix enviado]" });
    const checked = await checkReceipt(current, context.pix, () => readReceipt(Buffer.from(file.data, "base64"), file.mime));
    if (!checked.ok) {
      pending = checked.pending;
      await reply(checked.response, { intent: "pix" });
    } else {
      pending = null;
      await reply(`Comprovante conferido ✅ (${checked.summary})`, { intent: "pix" });
      await verify(current);
    }
  } else if (opts.file) rest = [...rest, "[O cliente enviou uma imagem/arquivo]"];

  if (rest.length) {
    const history = withoutPending([...previous.slice(-59), { role: "user" as const, content: rest.join("\n") }], pending);
    const turn = await assistantTurn({ history, texts: rest, context, pending, phone: LAB_PHONE, quote: quoteBasket });
    pending = pendingAfter(turn, pending);
    await reply(turn.response, { intent: turn.action, usage: Object.keys((turn.usage as object) ?? {}).length ? turn.usage : undefined });
    for (const url of turn.media) await reply(url, { intent: isPdfUrl(url) ? "document" : "image" });
  }
  const { error: saveError } = await client.from("wa_lab_sessions").update({ pending, updated_at: new Date().toISOString() }).eq("id", session.id);
  if (saveError) throw new Error("Não foi possível salvar a conversa de teste.");
  return labMessages(session.id);
}
