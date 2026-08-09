import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

function deviceLabel(userAgent: string) {
  const ua = userAgent.toLowerCase();
  const device = /iphone|ipad/.test(ua) ? "iOS" : /android/.test(ua) ? "Android" : /windows/.test(ua) ? "Windows" : /macintosh|mac os/.test(ua) ? "macOS" : "Dispositivo";
  const browser = /edg\//.test(ua) ? "Edge" : /chrome\//.test(ua) ? "Chrome" : /safari\//.test(ua) ? "Safari" : /firefox\//.test(ua) ? "Firefox" : "Navegador";
  return `${browser} / ${device}`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"]);
    if (auth.userId === "demo") return NextResponse.json({ updated: true });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { error } = await db.from("profiles").update({ last_seen_at: new Date().toISOString(), last_device_label: deviceLabel(request.headers.get("user-agent") || "") }).eq("id", auth.userId);
    if (error) throw error;
    return NextResponse.json({ updated: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao registrar presença." }, { status: 400 });
  }
}
