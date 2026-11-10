import { randomBytes } from "node:crypto";
import { activeMasses } from "@/lib/pizza-options";
import { answer, type AiResult, type Turn } from "./ai";
import { compactCatalog, resolveDraft } from "./catalog";
import { ACTIVE_STATUSES, friendlyError, money, ordersContext, summarize, type Basket, type Pending, type Quote, type RecentOrder } from "./domain";
import { menuFiles, withMenuLink } from "./menuMedia";
import { namesFor, type BotContext } from "./order";
import { liveStoreInfo, todayPromotions } from "./live";
import { judgeReceipt, pixInstructions, RECEIPT_FAILED_HANDOFF, type PixAccount, type ReceiptReading } from "./pix";
export { pendingAfter } from "./turnRules";

export function closedReply(store: BotContext["store"]) {
  return `A ${store.name} está fechada para novos pedidos no momento${store.hours ? ` (horário: ${store.hours})` : ""}. Você pode conferir o cardápio em ${store.menuUrl} e voltar quando abrirmos 🍕`;
}
/** Última linha de todo resumo (o WhatsApp mostra o botão "Confirmar pedido"). */
export const CONFIRM_LINE = "✅ Está tudo certo? Responda *SIM* para confirmar ou me diga o que quer mudar.";
export const HUMAN_REPLY = "Vou chamar alguém da nossa equipe para continuar com você por aqui 😊";
export const PRICE_CHANGED_REPLY = "Os valores ou condições mudaram desde o resumo. Vou conferir o pedido de novo antes de confirmar: me diga se quer manter os mesmos itens que eu refaço o resumo.";
export const COMMIT_FAILED_REPLY = "Tive um probleminha para registrar seu pedido 😕 Já chamei alguém da equipe para te ajudar por aqui.";
export const PIX_UNAVAILABLE_REPLY = "O Pix está indisponível agora 😕 Pode pagar em dinheiro ou cartão na entrega/retirada? Me diz qual que eu refaço o resumo.";

export function registeredReply(number: number, method: string, wait?: string) {
  const time = wait ? ` Previsão: *${wait}*.` : "";
  return method === "pix"
    ? `Comprovante conferido ✅ Seu pedido nº ${number} já foi para a cozinha! 🍕${time} Obrigado pela preferência.`
    : `Pedido nº ${number} confirmado ✅ Já está com a nossa equipe 🍕${time} Obrigado pela preferência.`;
}

/** Pix: depois do "sim", envia a chave e espera o comprovante (o pedido ainda não existe). */
export function pixRequest(pending: Pending, account: PixAccount) {
  if (!account.pix_key) throw new Error("PIX indisponível");
  return {
    response: pixInstructions(pending, account),
    followUps: [account.pix_key],
    pending: { ...pending, awaiting_receipt: true, receipt_attempts: 0, expires: new Date(Date.now() + 60 * 60000).toISOString() } as Pending,
  };
}

/** Lê e confere um comprovante; depois de 3 comprovantes inválidos a conversa vai para a equipe. */
export async function checkReceipt(pending: Pending, account: PixAccount, read: () => Promise<ReceiptReading>): Promise<{ ok: true; summary: string } | { ok: false; response: string; pending: Pending; pause: boolean }> {
  let verdict: ReturnType<typeof judgeReceipt>;
  try {
    verdict = judgeReceipt(await read(), pending.quote.total, account);
  } catch {
    verdict = { ok: false, reply: "Não consegui abrir esse arquivo 🤔 Pode mandar o comprovante como print (imagem) ou PDF?" };
  }
  if (verdict.ok) return verdict;
  const attempts = (pending.receipt_attempts ?? 0) + 1;
  return { ok: false, response: attempts >= 3 ? `${verdict.reply}\n\n${RECEIPT_FAILED_HANDOFF}` : verdict.reply, pending: { ...pending, receipt_attempts: attempts }, pause: attempts >= 3 };
}

/** Assuntos que justificam chamar a equipe já na primeira mensagem. */
const SPECIFIC_HANDOFF = /atendente|humano|pessoa|gerente|dono|reclama|problema|errad|frio|atras|cancel|estorno|reembolso|alergi|encomenda|evento|festa|curr[ií]culo|vaga|fornecedor|parceria/i;

/** A primeira mensagem nunca vai para a equipe, salvo assunto muito específico. */
export function firstContactGuard(history: Turn[], texts: string[], action: AiResult["action"]) {
  const first = !history.slice(0, -1).some((t) => t.role === "assistant");
  return first && action === "human" && !texts.some((t) => SPECIFIC_HANDOFF.test(t));
}

export type TurnResult = {
  response: string;
  pause: boolean;
  pending: Pending | null;
  usage: unknown;
  action: "reply" | "prepare" | "human" | "closed";
  media: string[];
  menuSent: boolean;
};

/**
 * Um turno da atendente, usado pelo WhatsApp e pelo Laboratório (o laboratório testa
 * exatamente o comportamento de produção). `history` já termina com a mensagem do cliente.
 */
export async function assistantTurn(opts: {
  history: Turn[];
  texts: string[];
  context: BotContext;
  phone: string;
  quote: (basket: Basket) => Promise<{ quote: Quote; basket: Basket }>;
  orders?: RecentOrder[];
  pending?: Pending | null;
  ai?: typeof answer;
}): Promise<TurnResult> {
  const { history, texts, context, phone } = opts;
  const { store } = context;
  const orders = opts.orders ?? [];
  const active = orders.some((o) => ACTIVE_STATUSES.includes(o.status));
  const base = { usage: {}, media: [] as string[], menuSent: false };
  // Loja fechada: resposta pronta, sem gastar IA, salvo pedido em andamento ou Pix aguardando.
  if (!store.open && !active && !opts.pending?.awaiting_receipt) return { ...base, response: closedReply(store), pause: false, pending: null, action: "closed" };
  if (texts.some((t) => /^\s*(humano|atendente|falar com (um |uma )?(atendente|pessoa|humano))\s*[.!?]?$/i.test(t))) return { ...base, response: HUMAN_REPLY, pause: true, pending: null, action: "human" };
  const catalog = compactCatalog(context.menu, context.zones, store);
  const waiting = opts.pending?.awaiting_receipt
    ? `AGUARDANDO COMPROVANTE PIX: o cliente já confirmou o pedido; falta mandar o comprovante (imagem ou PDF) do Pix de ${money(opts.pending.quote.total)} para a chave ${context.pix.pix_key}. O pedido só vai para a cozinha depois do comprovante. Se ele pedir a chave de novo, mande. Se quiser mudar o pedido, use prepare com o pedido completo.`
    : "";
  const live = [liveStoreInfo(context), waiting, ordersContext(orders), store.open ? "" : `LOJA FECHADA para novos pedidos agora. ${store.closedMessage}`].filter(Boolean).join("\n");
  const ai = opts.ai ?? answer;
  const result: AiResult = await ai({ store: { name: store.name, menuUrl: store.menuUrl }, catalog: catalog.text, history, context: live });
  if (firstContactGuard(history, texts, result.action)) {
    return { ...base, response: `Olá! Seja bem-vindo(a) à ${store.name} 😊 Como posso te ajudar? Se quiser, nosso cardápio está aqui: ${store.menuUrl}`, pause: false, pending: null, usage: result.usage, action: "reply" };
  }
  const firstReply = !history.slice(0, -1).some((t) => t.role === "assistant");
  const reply = firstReply ? result.reply : withoutGreeting(result.reply);
  let response = result.sendMenu ? withMenuLink(reply, store.menuUrl) : reply;
  const promoImages = result.sendPromo ? todayPromotions(context).map((p) => p.image).filter((url): url is string => Boolean(url)) : [];
  let pending: Pending | null = null;
  if (result.action === "prepare") {
    try {
      if (!result.order) throw new Error("Faltam dados do pedido");
      if (!store.open) throw new Error("A loja está fechada para novos pedidos agora");
      const draftBasket = resolveDraft(result.order, context.menu, catalog, phone, context.zones, store);
      const { quote, basket } = await opts.quote(draftBasket);
      if (basket.paymentMethod === "cash" && basket.changeFor && basket.changeFor < quote.total) throw new Error(`O troco precisa ser para um valor maior que o total de ${money(quote.total)}. Troco para quanto?`);
      if (basket.paymentMethod === "pix" && !context.pix.pix_key) throw new Error("O Pix está indisponível agora. Pode ser dinheiro ou cartão na entrega/retirada?");
      const summary = summarize(basket, quote, namesFor(context.menu, basket), activeMasses().length > 1);
      pending = { basket, quote, summary, code: randomBytes(4).toString("hex").toUpperCase(), expires: new Date(Date.now() + 60 * 60000).toISOString() };
      response = `${summary}\n\n${CONFIRM_LINE}`;
    } catch (error) {
      const message = friendlyError(error);
      // Perguntas do servidor (ex.: qual cidade) vão direto ao cliente.
      response = message.trim().endsWith("?") ? message : `Faltou um detalhe: ${message}. Pode me passar?`;
    }
  }
  return {
    response,
    pause: result.action === "human",
    pending,
    usage: result.usage,
    action: result.action,
    media: pending ? [] : [...promoImages, ...(result.sendMenu ? menuFiles() : [])],
    menuSent: result.sendMenu,
  };
}

/** Saudação só na primeira resposta: tira "Olá!", "Boa noite!" etc. do começo das seguintes. */
export function withoutGreeting(text: string) {
  const stripped = text.replace(/^\s*(?:(?:ol[áa]|oi+|opa|boa (?:noite|tarde)|bom dia|seja bem[- ]vind[oa](?:\(a\))?(?: [àa] [^!.?]+)?)[\s,!.]*(?:[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\s*)?)+/iu, "").trim();
  if (!stripped) return text;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** Qualquer alteração invalida o resumo anterior, inclusive durante a espera de confirmação. */
export function withoutPending(history: Turn[], pending: Pending | null) {
  if (!pending) return history;
  return [...history, { role: "assistant" as const, content: `Resumo anterior (ainda não confirmado): ${pending.summary}` }];
}
