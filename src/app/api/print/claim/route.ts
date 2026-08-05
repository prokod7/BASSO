import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const key = request.headers.get("x-print-bridge-key");
  if (!key || key !== process.env.PRINT_BRIDGE_KEY) return NextResponse.json({ error: "Bridge não autorizado." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(10, Number(body.limit || 3)));
  const { data, error } = await db.rpc("claim_print_jobs", { p_bridge_key: key, p_limit: limit });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data || [] });
}
