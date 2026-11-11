import { money, type Pending } from "./domain";

/** What the vision model read from the customer's receipt (strict schema). */
export type ReceiptReading = {
  is_pix_receipt: boolean;
  completed: boolean;
  amount_brl: number | null;
  recipient_name: string | null;
  recipient_key: string | null;
  paid_at: string | null;
  bank: string | null;
};
export type PixAccount = { pix_key: string | null; pix_name: string | null; key_type?: string | null; holder?: string | null };
export type ReceiptVerdict =
  | { ok: true; summary: string }
  | { ok: false; reply: string };

/** Tipo da chave para a mensagem ("CNPJ: 62.332.415/0001-10"). */
function keyLabel(account: PixAccount) {
  const type = (account.key_type || "").toLowerCase();
  const digits = (account.pix_key || "").replace(/\D/g, "");
  if (type === "cnpj" || (!type && digits.length === 14 && /[./-]/.test(account.pix_key || ""))) return "CNPJ";
  if (type === "cpf") return "CPF";
  if (type === "email" || (account.pix_key || "").includes("@")) return "E-mail";
  if (type === "phone" || type === "telefone") return "Telefone";
  return "Chave";
}

/** Mensagem do Pix no padrão da Basso; o pedido só é aceito com o comprovante. */
export function pixInstructions(p: Pending, account: PixAccount) {
  return (
    `Segue nossa chave PIX:\n\n` +
    `${keyLabel(account)}: *${account.pix_key}*\n` +
    `${account.holder || account.pix_name || ""}\n\n`.replace(/^\n\n$/, "\n") +
    `Valor: *${money(p.quote.total)}*\n\n` +
    `Nos envie o comprovante do pagamento, por favor! Seu pedido só é aceito depois que recebermos o comprovante. Obrigada! 🙏🏻`
  );
}

/** Só os números da chave CNPJ/CPF/telefone, para copiar e colar no banco. */
export function pixCopyText(account: PixAccount) {
  const key = account.pix_key || "";
  return ["CNPJ", "CPF", "Telefone"].includes(keyLabel(account)) ? key.replace(/\D/g, "") : key;
}

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const STOP = new Set([
  "ltda",
  "me",
  "eireli",
  "epp",
  "sa",
  "de",
  "da",
  "do",
  "dos",
  "das",
  "e",
  "mei",
]);

/** Key match tolerant to bank masking ("**.***.123/0001-**", "***456789**"). */
export function keyMatches(shown: string, key: string) {
  const k = key.replace(/[\s.\-/()]/g, "").toLowerCase();
  if (k.includes("@")) return shown.trim().toLowerCase() === k;
  const s = shown
    .replace(/[\s.\-/()]/g, "")
    .toLowerCase()
    .replace(/^\+?55(?=\d{10,11}$)/, "");
  const kk = k.replace(/^\+?55(?=\d{10,11}$)/, "");
  const visible = s.replace(/[^0-9a-z]/g, "");
  if (s.length === kk.length && /[*•x]/.test(s)) {
    let seen = 0;
    for (let i = 0; i < s.length; i++) {
      if (/[*•x]/.test(s[i])) continue;
      if (s[i] !== kk[i]) return false;
      seen++;
    }
    return seen >= 4;
  }
  return visible.length >= 6 && kk.includes(visible);
}
export function nameMatches(shown: string, name: string) {
  const wanted = norm(name)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP.has(w));
  if (!wanted.length) return false;
  const got = new Set(norm(shown).split(" "));
  return wanted.filter((w) => got.has(w)).length >= Math.min(2, wanted.length);
}

/** Decides in code (never by the model) whether the receipt pays this order. */
export function judgeReceipt(
  read: ReceiptReading,
  totalCents: number,
  account: PixAccount,
  now = Date.now(),
): ReceiptVerdict {
  if (!read.is_pix_receipt)
    return {
      ok: false,
      reply:
        "Hmm, não consegui identificar um comprovante de Pix nessa imagem 🤔 Pode me mandar o print do comprovante?",
    };
  if (!read.completed)
    return {
      ok: false,
      reply:
        "Esse Pix aparece como agendado ou não concluído 🤔 Assim que ele for concluído, me manda o comprovante, tá?",
    };
  const cents =
    read.amount_brl == null ? null : Math.round(read.amount_brl * 100);
  if (cents !== totalCents)
    return {
      ok: false,
      reply:
        cents == null
          ? "Não consegui ler o valor no comprovante 🤔 Pode mandar um print mais nítido?"
          : `O valor do comprovante (${money(cents)}) não bate com o total do pedido (*${money(totalCents)}*). Pode conferir pra mim?`,
    };
  const byKey =
    !!read.recipient_key &&
    !!account.pix_key &&
    keyMatches(read.recipient_key, account.pix_key);
  const byName =
    !!read.recipient_name &&
    !!account.pix_name &&
    nameMatches(read.recipient_name, account.pix_name);
  if (!byKey && !byName)
    return {
      ok: false,
      reply:
        !read.recipient_key && !read.recipient_name
          ? "Não consegui ver o destinatário no comprovante 🤔 Pode mandar um print mais nítido, mostrando para quem foi o Pix?"
          : `Esse comprovante não parece ter sido enviado para a nossa conta 🤔 A chave certa é *${account.pix_key}*. Pode conferir?`,
    };
  const paid = read.paid_at ? Date.parse(read.paid_at) : NaN;
  if (
    !Number.isNaN(paid) &&
    (paid < now - 24 * 3600000 || paid > now + 10 * 60000)
  )
    return {
      ok: false,
      reply:
        "Esse comprovante parece ser de outra data 🤔 Pode mandar o comprovante deste pagamento?",
    };
  return {
    ok: true,
    summary: `${money(cents)} para ${read.recipient_name ?? read.recipient_key}${read.paid_at ? ` em ${read.paid_at}` : ""}${read.bank ? ` (${read.bank})` : ""}`,
  };
}

export const RECEIPT_FAILED_HANDOFF =
  "Vou chamar alguém da equipe pra conferir o pagamento com você 😊";
