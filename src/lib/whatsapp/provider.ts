import { z } from "zod";
const message = z.object({
  id: z.string().min(1).max(300),
  from: z.string().regex(/^\d{10,15}$/),
  timestamp: z.string().regex(/^\d+$/),
  type: z.string(),
  text: z.object({ body: z.string().max(16000) }).optional(),
  interactive: z
    .object({
      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
  audio: z
    .object({ id: z.string(), mime_type: z.string().optional() })
    .optional(),
  image: z
    .object({ id: z.string(), caption: z.string().optional() })
    .optional(),
  document: z
    .object({
      id: z.string(),
      mime_type: z.string().optional(),
      filename: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
});
export type Incoming = z.infer<typeof message>;
export const envelope = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z
    .array(
      z.object({
        id: z.string(),
        changes: z
          .array(
            z.object({
              field: z.string(),
              value: z.object({
                metadata: z.object({ phone_number_id: z.string() }).optional(),
                contacts: z
                  .array(
                    z.object({
                      wa_id: z.string().optional(),
                      profile: z
                        .object({ name: z.string().max(200).optional() })
                        .optional(),
                    }),
                  )
                  .max(100)
                  .optional(),
                messages: z.array(message).optional(),
                message_echoes: z
                  .array(
                    z.object({
                      id: z.string(),
                      to: z.string(),
                      timestamp: z.string(),
                      type: z.string().optional(),
                      text: z
                        .object({ body: z.string().max(16000) })
                        .optional(),
                    }),
                  )
                  .optional(),
                statuses: z
                  .array(
                    z.object({
                      id: z.string(),
                      status: z.string(),
                      timestamp: z.string(),
                      biz_opaque_callback_data: z.string().optional(),
                    }),
                  )
                  .optional(),
              }),
            }),
          )
          .max(100),
      }),
    )
    .min(1)
    .max(100),
});
const HANDLED = ["messages", "smb_message_echoes"];
export function parseWebhook(raw: unknown, waba: string, phone: string) {
  // Other events (history/contact sync, app state, account updates) are acknowledged
  // and ignored: answering 4xx would make Meta retry and eventually disable the hook.
  const r = raw as { entry?: { changes?: { field?: string }[] }[] };
  const filtered = {
    ...r,
    entry: Array.isArray(r?.entry)
      ? r.entry.map((e) => ({
          ...e,
          changes: Array.isArray(e?.changes)
            ? e.changes.filter((c) => HANDLED.includes(String(c?.field)))
            : [],
        }))
      : r?.entry,
  };
  const b = envelope.parse(filtered);
  for (const e of b.entry) {
    if (!e.changes.length) continue;
    if (e.id !== waba) throw Error("Conta inválida");
    for (const c of e.changes)
      if (c.value.metadata?.phone_number_id !== phone)
        throw Error("Número inválido");
  }
  return b;
}
export async function sendMessage(to: string, body: string, callback: string) {
  // Summaries end with "Responda *SIM* para confirmar": add a one-tap button.
  const match = /Responda \*SIM\* para confirmar/.test(body);
  const message =
    match && body.length <= 1024
      ? {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: body },
            action: {
              buttons: [
                {
                  type: "reply",
                  reply: {
                    id: "SIM",
                    title: "Confirmar pedido",
                  },
                },
              ],
            },
          },
        }
      : { type: "text", text: { body, preview_url: false } };
  const res = await fetch(
    `https://api.dualhook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DUALHOOK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: `+${to}`,
        ...message,
        biz_opaque_callback_data: callback,
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!res.ok) throw Error(`Envio WhatsApp: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.messages?.[0]?.id) throw Error("Envio sem identificador");
  return data.messages[0].id as string;
}

/** Short readable text for the inbox; media is described, never downloaded here. */
export function inboxBody(m: {
  type?: string;
  text?: { body: string };
  interactive?: { button_reply?: { title: string } };
  image?: { caption?: string };
  document?: { caption?: string; filename?: string };
}) {
  if (m.text?.body) return m.text.body;
  if (m.interactive?.button_reply) return m.interactive.button_reply.title;
  const labels: Record<string, string> = {
    audio: "🎤 Áudio",
    image: "📷 Imagem",
    document: "📄 Documento",
    video: "🎬 Vídeo",
    sticker: "Figurinha",
    location: "📍 Localização",
  };
  const label = labels[m.type ?? ""] ?? "Mensagem";
  const caption =
    m.image?.caption ?? m.document?.caption ?? m.document?.filename;
  return caption ? `${label}: ${caption}` : label;
}

/** Sends a public image (JPEG/PNG URL), e.g. the menu pictures. */
/** Sends a public file by link: PDF as a document (keeps its name), otherwise a photo. */
export async function sendMedia(to: string, link: string, callback: string) {
  const media = /\.pdf$/i.test(link)
    ? {
        type: "document",
        document: {
          link,
          filename: decodeURIComponent(link.split("/").pop() ?? "Cardapio.pdf"),
        },
      }
    : { type: "image", image: { link } };
  const res = await fetch(
    `https://api.dualhook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DUALHOOK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: `+${to}`,
        ...media,
        biz_opaque_callback_data: callback,
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!res.ok) throw Error(`Envio de arquivo: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.messages?.[0]?.id) throw Error("Arquivo sem identificador");
  return data.messages[0].id as string;
}
