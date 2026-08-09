import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainIntegrationQueue } from "@/lib/workers/marketplace";
import { processNotificationJob } from "@/lib/workers/notifications";
import { queueCampaignById } from "@/lib/campaigns";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return bearer === secret || request.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const report = {
    integration: { claimed: 0, completed: 0, failed: 0 },
    notifications: { claimed: 0, completed: 0, failed: 0 },
    campaigns: { due: 0, queued: 0, failed: 0 },
    loyalty: { expired: 0 }
  };

  const { data: dueCampaigns, error: campaignError } = await db.from("campaigns").select("id").eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(10);
  if (!campaignError) {
    report.campaigns.due = dueCampaigns?.length || 0;
    for (const campaign of dueCampaigns || []) {
      try { await queueCampaignById(campaign.id, { label: "Cron" }); report.campaigns.queued += 1; }
      catch { report.campaigns.failed += 1; }
    }
  }

  const { data: expired } = await db.rpc("expire_loyalty_reward_authorizations", { p_limit: 100 });
  report.loyalty.expired = Number(expired || 0);

  const integration = await drainIntegrationQueue(10);
  report.integration = integration;

  const { data: jobs, error: notificationClaimError } = await db.rpc("claim_notification_jobs", { p_limit: 30 });
  if (notificationClaimError) return NextResponse.json({ ...report, error: notificationClaimError.message }, { status: 500 });
  report.notifications.claimed = jobs?.length || 0;
  for (const job of jobs || []) {
    try { await processNotificationJob(job); report.notifications.completed += 1; }
    catch { report.notifications.failed += 1; }
  }

  const failed = report.integration.failed + report.notifications.failed + report.campaigns.failed;
  return NextResponse.json({ ok: failed === 0, generatedAt: new Date().toISOString(), ...report }, { headers: { "Cache-Control": "no-store" } });
}
