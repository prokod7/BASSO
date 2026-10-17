import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperationalRole } from "@/lib/authz";

export async function POST(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "counter", "kitchen", "bar"], "kds.manage");
    const { jobId } = z.object({ jobId: z.string().min(1) }).parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: job, error: readError } = await db.from("print_jobs").select("id,order_id,status,attempts").eq("id", jobId).maybeSingle();
    if (readError) throw readError;
    if (!job) return NextResponse.json({ error: "Trabalho não encontrado." }, { status: 404 });
    if (!["failed", "cancelled", "done"].includes(job.status)) return NextResponse.json({ error: "O trabalho já está na fila ou em impressão." }, { status: 409 });
    if (job.order_id) {
      const { data: order, error } = await db.from("orders").select("id,status,deleted_at").eq("id", job.order_id).maybeSingle();
      if (error) throw error;
      if (!order || order.deleted_at || order.status === "cancelled") return NextResponse.json({ error: "Não é possível reimprimir um pedido cancelado ou arquivado." }, { status: 409 });
    }
    // Compare-and-set prevents two clicks from re-queueing a job claimed in between.
    const { data: updated, error } = await db.from("print_jobs").update({
      status: "queued", attempts: 0, last_error: null, claimed_at: null,
      processed_at: null, next_attempt_at: new Date().toISOString(),
    }).eq("id", jobId).eq("status", job.status).eq("attempts", job.attempts).select("id").maybeSingle();
    if (error) throw error;
    if (!updated) return NextResponse.json({ error: "A fila mudou. Atualize antes de tentar novamente." }, { status: 409 });
    return NextResponse.json({ queued: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao reprocessar." }, { status: 400 });
  }
}
