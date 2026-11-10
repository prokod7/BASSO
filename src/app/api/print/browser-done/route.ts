import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ jobId: z.string().uuid(), ok: z.boolean().default(true), error: z.string().max(300).optional() });

/** A estação avisa que mandou a via para a impressora (ou que falhou e deve tentar de novo). */
export async function POST(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "counter", "kitchen", "bar"], "kds.manage");
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const patch = body.ok
      ? { status: "done", processed_at: new Date().toISOString(), last_error: null }
      : { status: "queued", last_error: body.error || "Falha ao imprimir na estação" };
    const { error } = await db.from("print_jobs").update(patch).eq("id", body.jobId).eq("status", "processing");
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao confirmar impressão." }, { status: 400 });
  }
}
