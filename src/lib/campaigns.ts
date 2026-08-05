import { createAdminClient } from "@/lib/supabase/admin";

function matchesSegment(customer: any, segment: any) {
  if (!segment || segment.type === "all") return true;
  if (["new", "active", "frequent", "inactive"].includes(segment.type)) return customer.segment === segment.type;
  if (segment.type === "birthday") {
    if (!customer.birth_date) return false;
    const today = new Date();
    const [, month, day] = String(customer.birth_date).split("-").map(Number);
    return today.getMonth() + 1 === month && today.getDate() === day;
  }
  if (segment.type === "minimum_spend") return Number(customer.total_spent_cents || 0) >= Number(segment.minimumSpend || 0);
  return false;
}

export async function queueCampaignById(id: string, actor?: { id?: string | null; label?: string }) {
  const db = createAdminClient();
  if (!db) throw new Error("Supabase não configurado.");
  const { data: campaign, error: campaignError } = await db.from("campaigns").select("*").eq("id", id).single();
  if (campaignError) throw campaignError;
  if (campaign.status === "cancelled" || campaign.status === "completed") throw new Error("Campanha encerrada não pode ser enviada novamente.");
  const consentColumn = campaign.channel === "email" ? "marketing_email" : "marketing_push";
  const { data: allCustomers, error: customerError } = await db.from("crm_customer_metrics").select("id,name,email,birth_date,segment,total_spent_cents,marketing_email,marketing_push").eq("active", true).eq(consentColumn, true).limit(10000);
  if (customerError) throw customerError;
  const selected = (allCustomers || []).filter((customer: any) => matchesSegment(customer, campaign.segment)).filter((customer: any) => campaign.channel !== "email" || Boolean(customer.email));
  if (!selected.length) throw new Error("Nenhum cliente elegível e consentido neste segmento.");
  const recipients = selected.map((customer: any) => ({ campaign_id: id, customer_id: customer.id, status: "pending" }));
  const { error: recipientError } = await db.from("campaign_recipients").upsert(recipients, { onConflict: "campaign_id,customer_id", ignoreDuplicates: true });
  if (recipientError) throw recipientError;
  const jobs = selected.map((customer: any) => ({
    channel: campaign.channel,
    recipient_ref: campaign.channel === "email" ? customer.email : customer.id,
    template_key: "campaign",
    payload: {
      campaignId: id,
      customerId: customer.id,
      title: campaign.template?.title || "La Forneria Basso",
      subject: campaign.template?.title || "La Forneria Basso",
      message: campaign.template?.message || "",
      html: `<p>${String(campaign.template?.message || "").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`,
      url: campaign.template?.url
    },
    scheduled_at: new Date().toISOString()
  }));
  const { error: jobError } = await db.from("notification_jobs").insert(jobs);
  if (jobError) throw jobError;
  await db.from("campaigns").update({ status: "running", scheduled_at: campaign.scheduled_at || new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
  await db.from("audit_logs").insert({ actor_id: actor?.id || null, actor_label: actor?.label || "Sistema", action: "CAMPAIGN_QUEUED", entity_type: "campaign", entity_id: id, after_data: { recipients: selected.length, channel: campaign.channel } });
  return { id, status: "running" as const, recipients: selected.length, queued: jobs.length };
}
