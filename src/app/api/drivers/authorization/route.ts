import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDriverSession } from "@/lib/driver-terms";

const noStore = { "Cache-Control": "private, no-store" };
export async function GET() {
  try {
    const { db, profile } = await requireDriverSession();
    const { data, error } = await db.from("driver_terms_documents").select("version,title,body").eq("active", true).single();
    if (error) throw error;
    return NextResponse.json({ document: data, name: profile.display_name }, { headers: noStore });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar autorização." }, { status: 403, headers: noStore }); }
}
export async function POST(request: NextRequest) {
  try {
    const { db } = await requireDriverSession();
    const body = z.object({ version: z.string().min(1).max(80), name: z.string().trim().min(2).max(100), accepted: z.literal(true) }).parse(await request.json());
    const { error } = await db.rpc("accept_driver_terms", { p_version: body.version, p_name: body.name });
    if (error) throw error;
    return NextResponse.json({ accepted: true }, { headers: noStore });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao registrar aceite." }, { status: 400, headers: noStore }); }
}
