import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { quoteCommercialTerms } from "@/lib/server-quote";

const schema = z.object({
  items: z.array(z.any()).min(1).max(80),
  channel: z.enum(["own_delivery", "pickup", "counter", "dine_in", "ifood", "99food", "table_qr"]),
  couponCode: z.string().max(30).optional(),
  city: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const quote = await quoteCommercialTerms(body as any);
    return NextResponse.json(quote, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível calcular o pedido." },
      { status: 400 },
    );
  }
}
