import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedPrintBridge } from "@/lib/print-bridge-auth";

const schema = z.object({ jobId: z.string().uuid(), claimTime: z.string().datetime({ offset: true }), success: z.boolean(), error: z.string().max(2000).optional() });
export async function POST(request: NextRequest) {
  const key = request.headers.get("x-print-bridge-key");
  if (!isAuthorizedPrintBridge(key)) return NextResponse.json({ error: "Bridge não autorizado." }, { status: 401 });
  try {
    const input = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.from("print_jobs").update({
      status: input.success ? "done" : "cancelled",
      last_error: input.success ? null : input.error || "Falha na impressão. Confira a via antes de reimprimir.",
      processed_at: new Date().toISOString(), claimed_at: null,
    }).eq("id", input.jobId).eq("status", "processing").eq("claimed_at", input.claimTime).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Reserva expirada ou já encerrada." }, { status: 409 });
    return NextResponse.json({ updated: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao concluir impressão." }, { status: 400 });
  }
}
