import { openingHoursLabel, type OpeningHours } from "@/lib/opening-hours";
export async function loadBusinessSettings(db: any) {
  const { data, error } = await db
    .from("business_settings")
    .select("name,cnpj,phone,instagram,address,opening_hours,config")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  return {
    name: data.name,
    cnpj: typeof data.cnpj === "string" ? data.cnpj : null,
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
    addressLabel: formatStoreAddress(data.address),
    openingHours: data.opening_hours as OpeningHours,
    hoursLabel: openingHoursLabel(data.opening_hours as OpeningHours),
    whatsapp: typeof data.config?.whatsapp === "string" && data.config.whatsapp.trim() ? data.config.whatsapp.trim() : null,
    site: normalizeSiteContent(data.config?.site),
    // Chave Pix é informação pública de recebimento; exibida ao cliente que paga por Pix.
    pixKey: typeof data.config?.pixKey === "string" && data.config.pixKey.trim() ? data.config.pixKey.trim() : null,
    pixKeyType: typeof data.config?.pixKeyType === "string" ? data.config.pixKeyType : null,
  };
}

export type SiteContent = {
  heroBadge: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImage: string | null;
  /** Textos abaixo do título das seções de pizza; null usa o texto padrão. */
  sectionSubtitles: Record<"featured" | "traditional" | "premium" | "sweet", string | null>;
  /** Fotos dos cards de pizza no cardápio. Chaves: "traditional.grande", "featured.broto" etc. */
  images: Record<string, string>;
};

export const SITE_IMAGE_KEYS = [
  "hero",
  "featured.grande", "featured.broto",
  "traditional.grande", "traditional.broto",
  "premium.grande", "premium.broto",
  "sweet.grande", "sweet.broto",
] as const;

function text(value: unknown, max = 400) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export function normalizeSiteContent(raw: unknown): SiteContent {
  const site = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawImages = site.images && typeof site.images === "object" ? site.images as Record<string, unknown> : {};
  const images: Record<string, string> = {};
  for (const key of SITE_IMAGE_KEYS) {
    const url = rawImages[key];
    if (typeof url === "string" && /^https:\/\//.test(url)) images[key] = url;
  }
  return {
    heroBadge: text(site.heroBadge, 80),
    heroTitle: text(site.heroTitle, 120),
    heroSubtitle: text(site.heroSubtitle, 300),
    heroImage: images.hero || null,
    sectionSubtitles: (() => {
      const raw = site.sectionSubtitles && typeof site.sectionSubtitles === "object" ? site.sectionSubtitles as Record<string, unknown> : {};
      return { featured: text(raw.featured, 240), traditional: text(raw.traditional, 240), premium: text(raw.premium, 240), sweet: text(raw.sweet, 240) };
    })(),
    images,
  };
}

export function formatStoreAddress(address: unknown) {
  if (typeof address === "string") return address;
  const value = address && typeof address === "object" ? address as Record<string, unknown> : {};
  const part = (key: string) => typeof value[key] === "string" ? (value[key] as string).trim() : "";
  const street = [part("street"), part("number")].filter(Boolean).join(", ");
  const city = [part("city"), part("state")].filter(Boolean).join("/");
  return [street, part("district"), city].filter(Boolean).join(" — ") || "Rua do Progresso, 407 — Centro — Rio Grande da Serra/SP";
}
