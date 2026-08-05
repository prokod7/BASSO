import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/integrations/push";
import { jsonRequest } from "@/lib/integrations/http";

interface NotificationJob {
  id: string;
  channel: "push" | "email";
  recipient_ref?: string;
  template_key: string;
  payload: Record<string, any>;
}

async function sendEmail(job: NotificationJob) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.CAMPAIGN_FROM_EMAIL;
  if (!key || !from || !job.recipient_ref) throw new Error("E-mail transacional não configurado.");
  const payload = job.payload || {};
  await jsonRequest("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from,
      to: [job.recipient_ref],
      subject: payload.subject || "La Forneria Basso",
      html: payload.html || `<p>${String(payload.message || "")}</p>`
    })
  });
}

async function updateCampaignRecipient(job: NotificationJob, success: boolean) {
  const campaignId = job.payload?.campaignId;
  const customerId = job.payload?.customerId;
  if (!campaignId || !customerId) return;
  const db = createAdminClient();
  if (!db) return;
  await db.from("campaign_recipients").update({ status: success ? "sent" : "failed", sent_at: success ? new Date().toISOString() : null }).eq("campaign_id", campaignId).eq("customer_id", customerId);
  const { count } = await db.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).in("status", ["pending"]);
  if ((count || 0) === 0) await db.from("campaigns").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", campaignId).eq("status", "running");
}

export async function processNotificationJob(job: NotificationJob) {
  const db = createAdminClient();
  if (!db) throw new Error("Supabase não configurado.");
  try {
    if (job.channel === "push") {
      if (!job.recipient_ref) throw new Error("Destinatário push ausente.");
      await sendPush({
        externalUserIds: [job.recipient_ref],
        title: job.payload.title || "La Forneria Basso",
        message: job.payload.message || "Atualização do seu pedido",
        url: job.payload.url,
        data: job.payload.data
      });
    } else await sendEmail(job);
    await db.rpc("finish_notification_job", { p_id: job.id, p_success: true, p_error: null });
    await updateCampaignRecipient(job, true);
  } catch (error) {
    await db.rpc("finish_notification_job", { p_id: job.id, p_success: false, p_error: error instanceof Error ? error.message : "Falha desconhecida" });
    await updateCampaignRecipient(job, false);
    throw error;
  }
}
