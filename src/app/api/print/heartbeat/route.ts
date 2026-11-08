import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedPrintBridge } from "@/lib/print-bridge-auth";

export async function POST(request: NextRequest) {
  const key = request.headers.get("x-print-bridge-key");
  if (!isAuthorizedPrintBridge(key)) return NextResponse.json({ error: "Bridge não autorizado." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();
  const { error } = await db.from("integration_connections").upsert({ provider: "printer", active: true, environment: "production", last_health_at: now, last_health_status: "operational", last_success_at: now, last_error_message: null, metadata: { bridge: body.bridge || "PedidoPro Print Bridge", hostname: body.hostname || null, platform: body.platform || null, printers: Array.isArray(body.printers) ? body.printers : [], version: body.version || "1.0" }, updated_at: now }, { onConflict: "provider" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, serverTime: now });
}
