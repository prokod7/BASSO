import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  sectors: z.array(z.enum(["kitchen", "counter", "bar"])).min(1).max(3),
  since: z.string().datetime(),
});

/**
 * Estação de impressão no navegador (atalho do Chrome com impressão silenciosa).
 * Reivindica os trabalhos da fila de forma atômica (queued → done): cada comanda sai em
 * uma única estação, mesmo com duas abertas. Nunca pega trabalhos com mais de 2 h.
 */
export async function POST(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "counter", "kitchen", "bar"], "kds.manage");
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const floor = new Date(Math.max(Date.parse(body.since), Date.now() - 2 * 3600_000)).toISOString();
    const { data: waiting, error: readError } = await db
      .from("print_jobs")
      .select("id")
      .eq("status", "queued")
      .in("sector", body.sectors)
      .gte("created_at", floor)
      .order("created_at", { ascending: true })
      .limit(5);
    if (readError) throw readError;
    if (!waiting?.length) return NextResponse.json({ jobs: [] });
    const { data: claimed, error } = await db
      .from("print_jobs")
      .update({ status: "done", processed_at: new Date().toISOString(), last_error: null })
      .in("id", waiting.map((job) => job.id))
      .eq("status", "queued")
      .select("id,order_id,sector,is_reprint,created_at");
    if (error) throw error;
    return NextResponse.json({ jobs: (claimed || []).sort((a, b) => a.created_at.localeCompare(b.created_at)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao buscar impressões." }, { status: 400 });
  }
}
