import { hydratePrintJobs } from "@/lib/print-presentation";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedPrintBridge } from "@/lib/print-bridge-auth";

const schema = z.object({ printers: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)).min(1).max(32) });

export async function POST(request: NextRequest) {
  if (!isAuthorizedPrintBridge(request.headers.get("x-print-bridge-key"))) {
    return NextResponse.json({ error: "Bridge não autorizado." }, { status: 401 });
  }
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Atualize o bridge e configure as impressoras desta estação." }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const keys = input.data.printers.join(",");
  const destinations = `printer_key.in.(${keys}),sector.in.(${keys})`;
  const now = Date.now();
  const floor = new Date(now - 3 * 3600_000).toISOString();
  const expired = new Date(now - 10 * 60_000).toISOString();
  const { error: expireError } = await db.from("print_jobs")
    .update({ status: "cancelled", last_error: "Bridge sem confirmação. Confira a via antes da reimpressão manual." })
    .eq("status", "processing").lt("claimed_at", expired).or(destinations);
  if (expireError) return NextResponse.json({ error: expireError.message }, { status: 500 });

  const { data: job, error: readError } = await db.from("print_jobs").select("id,attempts")
    .eq("status", "queued").or(destinations)
    .or(`created_at.gte.${floor},and(attempts.eq.0,next_attempt_at.gte.${floor})`)
    .order("created_at").order("id").limit(1).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!job) return NextResponse.json({ jobs: [] });
  const { data, error } = await db.from("print_jobs")
    .update({ status: "processing", attempts: job.attempts + 1, claimed_at: new Date(now).toISOString(), processed_at: null, last_error: null })
    .eq("id", job.id).eq("status", "queued").eq("attempts", job.attempts).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: await hydratePrintJobs(db, data || []) });
}
