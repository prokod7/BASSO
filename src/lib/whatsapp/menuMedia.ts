/** Link do cardápio online enviado pelo robô. */
export function menuUrl() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://basso-pedido-pro.vercel.app").replace(/\/+$/, "");
}

/**
 * Arquivos enviados depois do link quando o cliente pede o cardápio (opcional).
 * WHATSAPP_MENU_FILES: URLs públicas separadas por vírgula. PDF vai como documento;
 * JPEG/PNG como foto (o WhatsApp não aceita WebP como foto).
 */
export function menuFiles(raw = process.env.WHATSAPP_MENU_FILES || "") {
  return raw.split(",").map((v) => v.trim()).filter((v) => isImageUrl(v) || isPdfUrl(v));
}

/** Garante o link na resposta mesmo se a IA esquecer. */
export function withMenuLink(reply: string, url = menuUrl()) {
  return reply.includes(url) ? reply : `${reply.trim()}\n\n📋 Cardápio completo: ${url}`;
}

export const isImageUrl = (v: string) => /^https:\/\/\S+\.(jpe?g|png)$/i.test(v.trim());
export const isPdfUrl = (v: string) => /^https:\/\/\S+\.pdf$/i.test(v.trim());
export const fileName = (url: string) => decodeURIComponent(url.split("/").pop() ?? "arquivo.pdf");
