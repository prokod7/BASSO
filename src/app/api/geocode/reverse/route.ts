import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mapReverseGeocodeAddress } from "@/lib/geocoding";

const schema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function POST(request: NextRequest) {
  try {
    const { latitude, longitude } = schema.parse(await request.json());
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "pt-BR");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent": "PedidoPro-Basso/1.0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`Serviço de endereço indisponível (${response.status}).`);
    const payload = await response.json();
    const address = mapReverseGeocodeAddress(payload, latitude, longitude);
    if (!address.street && !address.district && !address.city) {
      throw new Error("A localização foi encontrada, mas não foi possível identificar o endereço.");
    }

    return NextResponse.json(address, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível identificar o endereço." }, { status: 400 });
  }
}
