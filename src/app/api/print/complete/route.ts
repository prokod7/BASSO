import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedPrintBridge } from "@/lib/print-bridge-auth";

const schema = z.object({ jobId: z.string().uuid(), success: z.boolean(), error: z.string().max(2000).optional() });
export async function POST(request: NextRequest) {
  const key = request.headers.get("x-print-bridge-key");
  if (!isAuthorizedPrintBridge(key)) return NextResponse.json({ error: "Bridge não autorizado." }, { status: 401 });
  try {
    const input = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { error } = await db.rpc("finish_print_job", { p_id: input.jobId, p_success: input.success, p_error: input.error || null });
    if (error) throw error;
    return NextResponse.json({ updated: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao concluir impressão." }, { status: 400 });
  }
}
