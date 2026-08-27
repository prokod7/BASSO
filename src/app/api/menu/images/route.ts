import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "product-images";
const MAX_SIZE = 5 * 1024 * 1024;
const allowedTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function storagePathFromPublicUrl(url: string | null | undefined) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "menu.manage");
    const form = await request.formData();
    const file = form.get("file");
    const entity = String(form.get("entity") || "product");
    const id = String(form.get("id") || "").trim();
    if (!(file instanceof File)) throw new Error("Selecione uma imagem para enviar.");
    if (!id) throw new Error("Item não informado.");
    if (!['product','category'].includes(entity)) throw new Error("Tipo de item inválido.");
    if (!allowedTypes[file.type]) throw new Error("Formato inválido. Use JPG, PNG, WebP ou AVIF.");
    if (file.size <= 0 || file.size > MAX_SIZE) throw new Error("A imagem deve ter no máximo 5 MB.");

    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const table = entity === "category" ? "categories" : "products";
    const { data: row, error: rowError } = await db.from(table).select("id,image_url").eq("id", id).is("deleted_at", null).single();
    if (rowError || !row) throw new Error("Item não encontrado.");

    const extension = allowedTypes[file.type];
    const folder = entity === "category" ? "categories" : "products";
    const path = `${folder}/${id}/${Date.now()}-${randomUUID()}.${extension}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = db.storage.from(BUCKET).getPublicUrl(path);
    const url = publicUrlData.publicUrl;
    const { error: updateError } = await db.from(table).update({ image_url: url, updated_at: new Date().toISOString() }).eq("id", id);
    if (updateError) {
      await db.storage.from(BUCKET).remove([path]);
      throw updateError;
    }

    const oldPath = storagePathFromPublicUrl(row.image_url);
    if (oldPath && oldPath !== path) await db.storage.from(BUCKET).remove([oldPath]);

    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: "MENU_IMAGE_UPLOADED",
      entity_type: entity,
      entity_id: id,
      before_data: { image_url: row.image_url || null },
      after_data: { image_url: url, storage_path: path, content_type: file.type, bytes: file.size },
    });
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao enviar imagem." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "menu.manage");
    const body = await request.json() as { entity?: string; id?: string };
    const entity = body.entity || "product";
    const id = String(body.id || "").trim();
    if (!id || !['product','category'].includes(entity)) throw new Error("Item inválido.");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const table = entity === "category" ? "categories" : "products";
    const { data: row, error } = await db.from(table).select("image_url").eq("id", id).is("deleted_at", null).single();
    if (error) throw error;
    await db.from(table).update({ image_url: null, updated_at: new Date().toISOString() }).eq("id", id);
    const oldPath = storagePathFromPublicUrl(row.image_url);
    if (oldPath) await db.storage.from(BUCKET).remove([oldPath]);
    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: "MENU_IMAGE_REMOVED",
      entity_type: entity,
      entity_id: id,
      before_data: { image_url: row.image_url || null },
      after_data: { image_url: null },
    });
    return NextResponse.json({ removed: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao remover imagem." }, { status: 400 });
  }
}
