import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { itemDetails } from "@/lib/item-presentation";

let db: PGlite;
const driver = "00000000-0000-4000-8000-000000000051";
const other = "00000000-0000-4000-8000-000000000052";
const one = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows[0];
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, citext } });
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select 'service_role'$$;
    create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
    create schema extensions; create publication supabase_realtime;`);
  for (const file of fs.readdirSync("supabase/migrations").filter(name => /^\d+_/.test(name)).sort()) {
    // Existing migrations use 3 digit prefixes; the CLI generates timestamps for new ones.
    if (file.startsWith("2026")) continue;
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  await db.exec(fs.readFileSync("supabase/migrations/20261115055506_basso_requested_updates.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/20261115172921_correct_broto_and_location_authorization.sql", "utf8"));
}, 180000);
afterAll(async () => { await db?.close(); });

describe("alterações operacionais solicitadas pela Basso", () => {
  it("reinicia o número visível à meia-noite de São Paulo sem modificar IDs ou sequência permanente", async () => {
    const insert = (id: string, date: string) => db.query(`insert into orders(id,channel,customer_name,subtotal_cents,total_cents,payment_method,source_idempotency_key,created_at) values($1,'counter','Teste local',500,500,'cash',$1,$2)`, [id, date]);
    await insert("local-day-a", "2026-11-14T02:59:59Z");
    await insert("local-day-b", "2026-11-14T03:00:00Z");
    await Promise.all([insert("local-day-c", "2026-11-14T03:00:01Z"), insert("local-day-d", "2026-11-14T03:00:01Z")]);
    const rows = (await db.query<any>("select id,number,daily_number from orders order by number")).rows;
    expect(rows.map(r => r.daily_number)).toEqual([1, 1, 2, 3]);
    expect(new Set(rows.map(r => r.number)).size).toBe(4);
    expect(rows.map(r => r.id)).toEqual(["local-day-a", "local-day-b", "local-day-c", "local-day-d"]);
  });
  it("valida as combinações também no banco ao inserir e editar itens", async () => {
    for (const [index, a, b] of [[1,"chocolate","brigadeiro"],[2,"mozzarella","camarao"],[3,"camarao","caprese"]] as const) {
      await db.query("insert into order_items(id,order_id,kind,name_snapshot,quantity,unit_price_cents,selection) values($1,'local-day-b','pizza','Teste',1,500,$2::jsonb)", [`broto-${index}`, JSON.stringify({ size: "broto", flavorA: a, flavorB: b })]);
    }
    for (const [a,b] of [["mozzarella","chocolate"],["chocolate","mozzarella"]]) {
      const selection = JSON.stringify({ size: "broto", flavorA: a, flavorB: b });
      await expect(db.query("update order_items set selection=$1::jsonb where id='broto-1'", [selection])).rejects.toThrow(/Não misture doce com salgado/);
      await expect(db.query("insert into order_items(id,order_id,kind,name_snapshot,quantity,unit_price_cents,selection) values('mixed-local','local-day-b','pizza','Teste',1,500,$1::jsonb)", [selection])).rejects.toThrow(/Não misture doce com salgado/);
    }
    expect((await one("select count(*)::int n from order_items where id like 'broto-%'")).n).toBe(3);
  });
  it("cria e mantém o cadastro operacional do motoboy junto ao perfil", async () => {
    await db.query("insert into auth.users(id) values($1),($2)", [driver, other]);
    await db.query("insert into profiles(id,display_name,role) values($1,'Motoboy local','driver'),($2,'Outro motoboy','driver')", [driver, other]);
    expect(await one("select name,active from drivers where profile_id=$1", [driver])).toEqual({ name: "Motoboy local", active: true });
    await db.query("update profiles set display_name='Nome atualizado',active=false where id=$1", [driver]);
    expect(await one("select name,active from drivers where profile_id=$1", [driver])).toEqual({ name: "Nome atualizado", active: false });
    await db.query("update profiles set active=true where id=$1", [driver]);
  });
  it("exige aceite próprio, registra nome/data/versão e exige novo aceite para nova versão", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [driver]);
    expect((await one("select has_driver_authorization() ok")).ok).toBe(false);
    const terms = await one("select title,body from driver_terms_documents where active");
    expect(terms.title).toMatch(/compartilhamento de localização/);
    expect(terms.body).toMatch(/Autorizo expressamente o compartilhamento da localização/);
    await expect(db.query("select accept_driver_terms('versao-antiga','Teste local')")).rejects.toThrow(/atualizados/);
    await db.query("select accept_driver_terms('2026-11-15.2','Nome confirmado')");
    const first = await one("select display_name,version,accepted_at from driver_terms_acceptances where profile_id=$1", [driver]);
    expect(first).toMatchObject({ display_name: "Nome confirmado", version: "2026-11-15.2" });
    await db.query("select accept_driver_terms('2026-11-15.2','Tentativa repetida')");
    expect(await one("select display_name,version,accepted_at from driver_terms_acceptances where profile_id=$1", [driver])).toEqual(first);
    expect((await one("select has_driver_authorization() ok")).ok).toBe(true);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    expect((await one("select has_driver_authorization() ok")).ok).toBe(false);
    await expect(db.exec("update driver_terms_documents set body='alterado' where active")).rejects.toThrow(/nova versão/);
    await db.exec("update driver_terms_documents set active=false; insert into driver_terms_documents(version,title,body,active) values('local-v2','Novos termos','Novo texto para teste',true)");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [driver]);
    expect((await one("select has_driver_authorization() ok")).ok).toBe(false);
    await db.query("select accept_driver_terms('local-v2','Nome confirmado')");
    expect((await one("select count(*)::int n from driver_terms_acceptances where profile_id=$1", [driver])).n).toBe(2);
    expect((await one("select has_table_privilege('authenticated','driver_terms_acceptances','insert') ok")).ok).toBe(false);
  });
  it("mescla textos e fotos, preserva outras configurações e remove somente a foto escolhida", async () => {
    const { id } = await one("select id from business_settings limit 1");
    await db.query("select patch_business_settings($1,$2::jsonb)", [id, JSON.stringify({ config: { custom: "preservado", site: { heroTitle: "Título local", images: { hero: "https://example.com/1.jpg" } } } })]);
    await Promise.all([
      db.query("select patch_business_settings($1,$2::jsonb)", [id, JSON.stringify({ config: { site: { heroSubtitle: "Apresentação nova" } } })]),
      db.query("select patch_business_settings($1,$2::jsonb)", [id, JSON.stringify({ config: { site: { images: { "sweet.broto": "https://example.com/2.jpg" } } } })]),
    ]);
    const { config } = await one("select config from business_settings where id=$1", [id]);
    expect(config).toMatchObject({ custom: "preservado", site: { heroTitle: "Título local", heroSubtitle: "Apresentação nova", images: { hero: "https://example.com/1.jpg", "sweet.broto": "https://example.com/2.jpg" } } });
    await db.query("select patch_business_settings($1,$2::jsonb)", [id, JSON.stringify({ config: { site: { images: { hero: null } } } })]);
    expect((await one("select config->'site'->'images' images from business_settings where id=$1", [id])).images).toEqual({ "sweet.broto": "https://example.com/2.jpg" });
  });
  it("imprime cada adicional entre parênteses com sabor ou pizza inteira e respeita a ordem", () => {
    const lines = itemDetails({ selection: { size: "grande", mass: "traditional", flavorA: "a", flavorB: "b", removedA: [], removedB: [], addons: { milho: 1, catupiry: 2, bacon: 1 }, addonPlacements: { milho: "halfA", catupiry: "halfB", bacon: "whole" }, notes: "", labels: { a: "Mussarela", b: "Calabresa", milho: "Milho", catupiry: "Catupiry", bacon: "Bacon" } } }).map(l => l.text);
    expect(lines.slice(1)).toEqual(["1/2 Mussarela", "1x (Milho — Mussarela)", "1/2 Calabresa", "2x (Catupiry — Calabresa)", "1x (Bacon — Pizza inteira)"]);
  });
});

