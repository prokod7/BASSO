import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ applied: z.boolean() });
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter"], "payments.manage");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.rpc("set_tab_service_charge", { p_tab_id: id, p_applied: body.applied, p_actor_id: auth.userId === "demo" ? null : auth.userId });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao alterar taxa de serviço." }, { status: 400 });
  }
}
