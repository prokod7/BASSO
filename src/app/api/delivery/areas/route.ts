import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicDeliveryDistrict = {
  name: string;
  aliases: string[];
  fee: number;
  minimumOrder: number;
};

export type PublicDeliveryCity = {
  name: string;
  districts: PublicDeliveryDistrict[];
};

export async function GET() {
  try {
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const { data, error } = await db
      .from("delivery_zones")
      .select("city,districts,fee_cents,minimum_order_cents")
      .eq("active", true)
      .is("deleted_at", null)
      .order("city");
    if (error) throw error;

    const grouped = new Map<string, PublicDeliveryDistrict[]>();
    for (const row of data || []) {
      const city = String(row.city || "").trim();
      const aliases = Array.isArray(row.districts)
        ? row.districts.map((value) => String(value).trim()).filter(Boolean)
        : [];
      if (!city || !aliases.length) continue;

      const district: PublicDeliveryDistrict = {
        name: aliases[0],
        aliases,
        fee: Number(row.fee_cents || 0),
        minimumOrder: Number(row.minimum_order_cents || 0),
      };
      grouped.set(city, [...(grouped.get(city) || []), district]);
    }

    const preferredOrder = ["Rio Grande da Serra", "Ribeirão Pires", "Mauá", "Santo André"];
    const cities: PublicDeliveryCity[] = [...grouped.entries()]
      .map(([name, districts]) => ({
        name,
        districts: districts.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      }))
      .sort((a, b) => {
        const ai = preferredOrder.indexOf(a.name);
        const bi = preferredOrder.indexOf(b.name);
        if (ai >= 0 || bi >= 0) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
        return a.name.localeCompare(b.name, "pt-BR");
      });

    return NextResponse.json(
      { cities, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar área de entrega." },
      { status: 400 },
    );
  }
}
