import { removeDessertPitch } from "./turnRules";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Turn } from "./ai";
import { enabled } from "./config";
import { phoneVariants, pickLead, RECENT_ORDER_FIELDS, type BatchJob, type Pending, type RecentOrder } from "./domain";
import { downloadMedia, incomingText, readReceipt, RECEIPT_TYPES } from "./media";
import { isPdfUrl, menuFiles, menuUrl } from "./menuMedia";
import { loadBotContext, placeWhatsAppOrder, PriceChangedError, quoteBasket } from "./order";
import { sendMedia, sendMessage, type Incoming } from "./provider";
import { assistantTurn, checkReceipt, COMMIT_FAILED_REPLY, pendingAfter, PIX_UNAVAILABLE_REPLY, pixRequest, PRICE_CHANGED_REPLY, registeredReply, withoutPending } from "./turn";

type Job = BatchJob & { id: string; payload: Incoming; response: string | null; handoff: boolean; order_result: { id: string; number: number } | null; created_at: string };
type Claim =
  | { wait: number }
  | { lease: string; claimed_at: string; session: { id: string; phone: string; pending: Pending | null; history: Turn[]; last_inbound: string }; job: Job; jobs?: Job[] };

function db() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase não configurado");
  return client;
}
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await db().rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
const log = (phone: string, id: string, body: string, kind: string) =>
  rpc("wa_log_message", { p: phone, m: id, body, kind, direction: "out", author: "bot", contact: null, sent_at: null });

const receiptJob = (jobs: Job[]) => [...jobs].reverse().find((j) => ["image", "document"].includes(j.payload.type));
const rawTexts = (jobs: Job[]) => jobs.map((j) => j.payload.text?.body ?? j.payload.interactive?.button_reply?.title ?? "").filter(Boolean).join("\n");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Resposta a um lote pode ser descartada e refeita enquanto a primeira mensagem tem menos que isto. */
const SUPERSEDE_WINDOW_MS = 90000;

export function followUpText() {
  return `Ficou com alguma dúvida? 😊 Aqui está o nosso cardápio completo. É só me dizer o que você quer que eu anoto o pedido.\n\n📋 ${menuUrl()}`;
}

/** Cliente que parou de responder recebe o cardápio uma vez (link + arquivos configurados). */
export async function processFollowUps() {
  if (!enabled()) return { sent: 0 };
  const due = (await rpc("wa_due_follow_ups")) as { session_id: string; phone: string }[];
  let sent = 0;
  for (const target of due ?? []) {
    try {
      const text = followUpText();
      await log(target.phone, await sendMessage(target.phone, text, target.session_id), text, "text");
      for (const url of menuFiles()) await log(target.phone, await sendMedia(target.phone, url, target.session_id), url, isPdfUrl(url) ? "document" : "image");
      await db().from("wa_sessions").update({ menu_sent_at: new Date().toISOString() }).eq("id", target.session_id);
      sent++;
    } catch {
      console.error("whatsapp_follow_up_failed");
    }
  }
  return { sent };
}

/** Tempo de hoje (Configurar robô) para a mensagem de pedido confirmado. */
async function waitTime(channel?: string) {
  try {
    const { data } = await db().from("wa_settings").select("pickup_time,delivery_time").eq("id", true).maybeSingle();
    return (channel === "pickup" ? data?.pickup_time : data?.delivery_time) || undefined;
  } catch { return undefined; }
}

export async function processQueue({ limit = 5, budgetMs = 150000 }: { limit?: number; budgetMs?: number } = {}) {
  if (!enabled()) return { processed: 0, disabled: true };
  let processed = 0;
  const deadline = Date.now() + budgetMs;
  while (processed < limit && Date.now() < deadline) {
    const claim = (await rpc("wa_claim")) as Claim | null;
    if (!claim) break;
    if ("wait" in claim) {
      // Cliente ainda digitando: espera a janela de silêncio em vez de responder cada mensagem.
      const ms = Math.ceil(claim.wait * 1000) + 300;
      if (Date.now() + ms > deadline) break;
      await sleep(ms);
      continue;
    }
    const { session, lease } = claim;
    const jobs = claim.jobs?.length ? claim.jobs : [claim.job];
    const { lead: job, confirm } = pickLead(jobs, session.pending);
    const step = (op: string, b: Record<string, unknown> = {}) => rpc("wa_transition", { jid: job.id, l: lease, op, b });
    /** Cria (ou recupera) o pedido do resumo confirmado, sob o lease da conversa. */
    const commit = async (pending: Pending, pixReceipt?: string) => {
      const checked = await step("check", { code: pending.code, ...(pixReceipt ? { pix_receipt: pixReceipt } : {}) });
      if (checked.stopped) return null;
      const order = checked.order ?? (await placeWhatsAppOrder(db(), pending, { pixReceipt }));
      await step("committed", { order });
      return order as { id: string; number: number };
    };
    // Etapa em execução quando quebrou: registrada sem texto, telefone ou corpo de provedor.
    let stage = "preparar";
    try {
      let response = job.response;
      let pause = job.handoff;
      let media: string[] = [];
      let followUps: string[] = [];
      let historyNote: string | undefined;
      let menuSent = false;
      if (!response) {
        let pending = session.pending;
        let history = [...session.history];
        let aiUsage: unknown = {};
        let allowSupersede = false;
        if (Date.now() - Number(job.payload.timestamp) * 1000 > 23 * 3600000) {
          await step("skip");
          processed++;
          continue;
        }
        if (job.order_result) {
          response = registeredReply(job.order_result.number, session.pending?.basket.paymentMethod ?? "", await waitTime(session.pending?.basket.channel));
          pending = null;
        } else if (confirm && pending!.basket.paymentMethod === "pix") {
          stage = "chave-pix";
          const context = await loadBotContext(db());
          history.push({ role: "user", content: rawTexts(jobs) });
          if (context.pix.pix_key) {
            const request = pixRequest(pending!, context.pix);
            response = request.response;
            followUps = request.followUps;
            pending = request.pending;
          } else {
            pending = null;
            response = PIX_UNAVAILABLE_REPLY;
          }
        } else if (confirm) {
          stage = "registrar-pedido";
          history.push({ role: "user", content: rawTexts(jobs) });
          try {
            const order = await commit(pending!);
            if (!order) { processed++; continue; }
            response = registeredReply(order.number, pending!.basket.paymentMethod, await waitTime(pending!.basket.channel));
            pending = null;
          } catch (error) {
            if (String(error).includes("LEASE_LOST")) throw error;
            pending = null;
            if (error instanceof PriceChangedError) response = PRICE_CHANGED_REPLY;
            else if (/fechada|pausad/i.test(String(error))) response = `${(error as Error).message} Assim que abrirmos, é só me chamar 😊`;
            else {
              console.error("whatsapp_commit_failed", { jobId: job.id });
              response = COMMIT_FAILED_REPLY;
              pause = true;
            }
          }
        } else if (pending?.awaiting_receipt && receiptJob(jobs)) {
          stage = "comprovante";
          const file = receiptJob(jobs)!;
          const context = await loadBotContext(db());
          history.push({ role: "user", content: "[comprovante do Pix enviado]" });
          const checked = await checkReceipt(pending, context.pix, async () => {
            const { bytes, mime } = await downloadMedia(file.payload);
            if (!RECEIPT_TYPES.includes(mime)) throw new Error("Formato");
            return readReceipt(bytes, mime);
          });
          if (checked.ok) {
            try {
              const order = await commit(pending, checked.summary);
              if (!order) { processed++; continue; }
              response = registeredReply(order.number, "pix", await waitTime(pending.basket.channel));
              pending = null;
            } catch (error) {
              if (String(error).includes("LEASE_LOST")) throw error;
              // O cliente já pagou: nunca deixar sem resposta.
              console.error("whatsapp_pix_commit_failed", { jobId: job.id });
              pause = true;
              response = "Recebi seu comprovante 🙌 Tive um probleminha para registrar o pedido, então já chamei alguém da equipe para finalizar com você por aqui.";
            }
          } else {
            response = checked.response;
            pending = checked.pending;
            pause = checked.pause;
          }
        } else {
          stage = "ler-mensagem";
          const texts = await Promise.all(jobs.map((j) => incomingText(j.payload)));
          // A caixa de entrada mostrou só "🎤 Áudio": grava o que foi dito.
          await Promise.all(jobs.map(async (j, i) => {
            const label = { audio: "🎤 Áudio", image: "📷 Imagem", document: "📄 Documento" }[j.payload.type as "audio"] ?? "";
            const said = (texts[i] ?? "").replace(/^\[[^\]]*\]:\s*/, "").trim();
            if (!label || !said || said.startsWith("[") || !j.payload.id) return;
            await rpc("wa_set_transcription", { m: j.payload.id, txt: `${label}: ${said}`.slice(0, 16000) }).catch(() => undefined);
          }));
          const text = texts.filter(Boolean).join("\n").slice(0, 16000);
          allowSupersede = Date.now() - Date.parse(jobs[0].created_at) < SUPERSEDE_WINDOW_MS;
          history.push({ role: "user", content: text });
          history = withoutPending(history, pending);
          stage = "montar-resposta";
          const context = await loadBotContext(db());
          // Pedidos reais do cliente nas últimas 12 h (site ou WhatsApp), para perguntas de status.
          const { data: orders } = await db()
            .from("orders")
            .select(RECENT_ORDER_FIELDS)
            .in("customer_phone", phoneVariants(session.phone))
            .is("deleted_at", null)
            .gte("created_at", new Date(Date.now() - 12 * 3600000).toISOString())
            .order("created_at", { ascending: false })
            .limit(3);
          const turn = await assistantTurn({ history, texts, context, orders: (orders ?? []) as RecentOrder[], pending, phone: session.phone, quote: quoteBasket });
          response = turn.response;
          pause = turn.pause;
          // Resposta simples mantém o resumo confirmável; qualquer outra coisa o substitui.
          pending = pendingAfter(turn, pending);
          aiUsage = turn.usage;
          media = turn.media;
          menuSent = turn.menuSent;
          if (turn.followUps?.length) followUps = turn.followUps;
          historyNote = turn.historyNote;
        }
        history.push({ role: "assistant", content: historyNote ? `${response!}\n${historyNote}` : response! });
        stage = "salvar-resposta";
        const staged = await step("stage", { pending, history: history.slice(-30), response, usage: aiUsage, pause, allow_supersede: allowSupersede, claimed_at: claim.claimed_at });
        if (staged.stopped) {
          // Lotes descartados voltam para a fila e são respondidos juntos no próximo ciclo.
          if (!staged.superseded) processed++;
          continue;
        }
      }
      stage = "enviar";
      const sending = await step("sending");
      if (sending.stopped) { processed++; continue; }
      response = removeDessertPitch(response!);
      const id = await sendMessage(session.phone, response, job.id);
      stage = "confirmar-envio";
      await step("sent", { outbound_id: id, pause });
      if (menuSent) await db().from("wa_sessions").update({ menu_sent_at: new Date().toISOString() }).eq("id", session.id);
      // Aguardando o cliente: se ele sumir, manda o cardápio uma vez.
      if (!pause) await rpc("wa_arm_follow_up", { sid: session.id }).catch(() => undefined);
      // Textos extras curtos (ex.: só a chave Pix, fácil de copiar); nunca reenviar o texto principal.
      for (const text of followUps) {
        try { await log(session.phone, await sendMessage(session.phone, text, job.id), text, "text"); }
        catch { console.error("whatsapp_followup_failed", { jobId: job.id }); }
      }
      for (const url of media) {
        try { await log(session.phone, await sendMedia(session.phone, url, job.id), url, isPdfUrl(url) ? "document" : "image"); }
        catch { console.error("whatsapp_menu_file_failed", { jobId: job.id }); }
      }
      processed++;
    } catch (cause) {
      console.error("whatsapp_job_failed", { jobId: job.id, stage, error: cause instanceof Error ? cause.name : typeof cause });
      try { await step("release"); } catch { console.error("whatsapp_lease_release_failed", { jobId: job.id }); }
      processed++;
      if (Date.now() + 3000 < deadline) await sleep(3000);
    }
  }
  const { sent } = await processFollowUps().catch(() => ({ sent: 0 }));
  return { processed, follow_ups: sent };
}
