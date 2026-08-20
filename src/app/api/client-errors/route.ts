import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  errorId: z.string().min(4).max(80),
  route: z.string().max(300).optional(),
  message: z.string().max(1200),
  stack: z.string().max(8000).optional(),
  digest: z.string().max(300).optional(),
  appVersion: z.string().max(30).optional(),
  userAgent: z.string().max(1000).optional(),
  online: z.boolean().optional(),
});

function redact(value: string) {
  return value
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_\-]+/g, "[SUPABASE_KEY_REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/[A-Za-z0-9+/=_-]{80,}/g, "[TOKEN_REDACTED]");
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"]);
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const { error } = await db.from("client_error_events").insert({
      error_id: body.errorId,
      route: body.route || null,
      message: redact(body.message),
      stack: body.stack ? redact(body.stack) : null,
      digest: body.digest || null,
      app_version: body.appVersion || "9.0.0",
      user_agent: body.userAgent || null,
      online: body.online ?? null,
      user_id: auth.userId === "demo" ? null : auth.userId,
      user_role: auth.role,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, errorId: body.errorId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao registrar erro." }, { status: 400 });
  }
}
