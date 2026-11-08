import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_IMAGE_KEYS } from "@/lib/business-settings";

const BUCKET = "product-images";
const MAX_SIZE = 5 * 1024 * 1024;
const allowedTypes: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

function storagePathFromPublicUrl(url: unknown) {
  if (typeof url !== "string") return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  return index < 0 ? null : decodeURIComponent(url.slice(index + marker.length));
}

function validKey(value: unknown): value is (typeof SITE_IMAGE_KEYS)[number] {
  return typeof value === "string" && (SITE_IMAGE_KEYS as readonly string[]).includes(value);
}

type Db = NonNullable<ReturnType<typeof createAdminClient>>;
async function loadSettings(db: Db) {
  const { data, error } = await db.from("business_settings").select("id,config").order("created_at").limit(1).single();
  if (error || !data) throw new Error("Configurações da loja não encontradas.");
  const config = (data.config || {}) as Record<string, unknown>;
  const site = (config.site && typeof config.site === "object" ? config.site : {}) as Record<string, unknown>;
  const images = (site.images && typeof site.images === "object" ? site.images : {}) as Record<string, string>;
  return { id: data.id as string, config, site, images };
}

async function saveImages(db: Db, settings: Awaited<ReturnType<typeof loadSettings>>, images: Record<string, string>) {
  const { error } = await db.from("business_settings").update({
    config: { ...settings.config, site: { ...settings.site, images } },
    updated_at: new Date().toISOString(),
  }).eq("id", settings.id);
  if (error) throw error;
}

/** Envia a foto do topo do site ou de uma seção de pizza (Grande/Broto). */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "menu.manage");
    const form = await request.formData();
    const file = form.get("file");
    const key = form.get("key");
    if (!validKey(key)) throw new Error("Local da imagem inválido.");
    if (!(file instanceof File)) throw new Error("Selecione uma imagem para enviar.");
    if (!allowedTypes[file.type]) throw new Error("Formato inválido. Use JPG, PNG, WebP ou AVIF.");
    if (file.size <= 0 || file.size > MAX_SIZE) throw new Error("A imagem deve ter no máximo 5 MB.");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const settings = await loadSettings(db);
    const path = `site/${key.replace(".", "-")}/${Date.now()}-${randomUUID()}.${allowedTypes[file.type]}`;
    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (uploadError) throw uploadError;
    const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const previous = settings.images[key];
    try { await saveImages(db, settings, { ...settings.images, [key]: url }); }
    catch (error) { await db.storage.from(BUCKET).remove([path]); throw error; }
    const oldPath = storagePathFromPublicUrl(previous);
    if (oldPath && oldPath !== path) await db.storage.from(BUCKET).remove([oldPath]);
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "SITE_IMAGE_UPLOADED", entity_type: "business_settings", entity_id: settings.id, before_data: { key, url: previous || null }, after_data: { key, url } });
    return NextResponse.json({ key, url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao enviar imagem." }, { status: 400 });
  }
}

/** Remove a foto personalizada; o site volta a usar a foto padrão. */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "menu.manage");
    const body = await request.json().catch(() => ({})) as { key?: unknown };
    if (!validKey(body.key)) throw new Error("Local da imagem inválido.");
    const key = body.key;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const settings = await loadSettings(db);
    const previous = settings.images[key];
    const images = { ...settings.images };
    delete images[key];
    await saveImages(db, settings, images);
    const oldPath = storagePathFromPublicUrl(previous);
    if (oldPath) await db.storage.from(BUCKET).remove([oldPath]);
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "SITE_IMAGE_REMOVED", entity_type: "business_settings", entity_id: settings.id, before_data: { key, url: previous || null }, after_data: { key, url: null } });
    return NextResponse.json({ removed: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao remover imagem." }, { status: 400 });
  }
}
