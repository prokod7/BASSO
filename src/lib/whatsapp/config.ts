/**
 * Robô de atendimento no WhatsApp. Desligado em duas camadas: a variável
 * WHATSAPP_BOT_ENABLED na Vercel e o botão em Painel → WhatsApp (wa_settings.enabled).
 * Nenhuma chave vai para o navegador.
 */
export const requiredWhatsAppEnv = [
  "OPENAI_API_KEY",
  "OPENAI_WHATSAPP_MODEL",
  "DUALHOOK_API_KEY",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_WABA_ID",
  "WHATSAPP_WEBHOOK_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
] as const;

export function readiness() {
  const missing: string[] = requiredWhatsAppEnv.filter((key) => !process.env[key]);
  if (process.env.WHATSAPP_WEBHOOK_SECRET && process.env.WHATSAPP_WEBHOOK_SECRET.length < 32) missing.push("WHATSAPP_WEBHOOK_SECRET");
  return { enabled: process.env.WHATSAPP_BOT_ENABLED === "true", ready: missing.length === 0, missing: [...new Set(missing)] };
}

export function enabled() {
  const state = readiness();
  return state.enabled && state.ready;
}

export function canSend() {
  return Boolean(process.env.DUALHOOK_API_KEY && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Laboratório: só precisa da OpenAI; o robô pode continuar desligado. */
export function labReadiness() {
  const missing = ["OPENAI_API_KEY", "OPENAI_WHATSAPP_MODEL"].filter((key) => !process.env[key]);
  return { ready: missing.length === 0, missing };
}
