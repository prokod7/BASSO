import { openingHoursLabel, type OpeningHours } from "@/lib/opening-hours";
export async function loadBusinessSettings(db: any) {
  const { data, error } = await db
    .from("business_settings")
    .select("name,phone,instagram,address,opening_hours,config")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  return {
    name: data.name,
    phone: data.phone,
    phones: [
      ...new Set(
        [
          data.phone,
          ...(Array.isArray(data.config?.contactPhones)
            ? data.config.contactPhones
            : []),
        ].filter((p): p is string => typeof p === "string" && p.length > 0),
      ),
    ],
    instagram: data.instagram,
    address: data.address,
    openingHours: data.opening_hours as OpeningHours,
    hoursLabel: openingHoursLabel(data.opening_hours as OpeningHours),
    // Chave Pix é informação pública de recebimento; exibida ao cliente que paga por Pix.
    pixKey: typeof data.config?.pixKey === "string" && data.config.pixKey.trim() ? data.config.pixKey.trim() : null,
    pixKeyType: typeof data.config?.pixKeyType === "string" ? data.config.pixKeyType : null,
  };
}
