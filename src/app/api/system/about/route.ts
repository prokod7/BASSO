import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SystemAbout } from "@/types";

export async function GET() {
  try {
    await requireOperationalRole(["manager", "viewer"]);
    const db = createAdminClient();
    let databaseVersion: number | null = null;
    let databaseMigrationName: string | undefined;
    if (db) {
      const { data } = await db.from("system_migrations").select("version,name").order("version", { ascending: false }).limit(1).maybeSingle();
      if (data) {
        databaseVersion = Number(data.version);
        databaseMigrationName = String(data.name);
      }
    }
    const about: SystemAbout = {
      appName: "PedidoPro",
      clientName: "La Forneria Basso",
      version: "5.0.0",
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
      databaseVersion,
      databaseMigrationName,
      supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      demoMode: process.env.NEXT_PUBLIC_DEMO_MODE !== "false",
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(about, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar instalação." }, { status: 400 });
  }
}
