import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapPrintProfile } from "@/lib/admin-control";

export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter", "kitchen", "bar", "viewer"], "print.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.from("print_profiles").select("*").order("sector").order("name");
    if (error) throw error;
    return NextResponse.json({ profiles: (data || []).map((row: Record<string, unknown>) => mapPrintProfile(row)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar perfis de impressão." }, { status: 400 });
  }
}
