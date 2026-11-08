import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const rows = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows;

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, citext } });
  // Stubs mínimos do ambiente Supabase.
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create function auth.role() returns text language sql as $$select 'service_role'$$;
    create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
    create schema extensions; create publication supabase_realtime;`);
  for (const file of fs.readdirSync("supabase/migrations").filter(name => /^\d{3}_/.test(name)).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
}, 180_000);
afterAll(async () => { await db?.close(); });

describe("migration 041 — mesas configuráveis", () => {
  it("mantém as 15 mesas existentes e aceita novas mesas com qualquer capacidade", async () => {
    expect(await rows("select count(*)::int as n from restaurant_tables where active")).toEqual([{ n: 15 }]);
    await db.exec("insert into restaurant_tables(number,capacity,status) values(16,4,'free'),(40,8,'free')");
    await db.exec("select public.open_table_tab(16,'Ana',2,null)");
    expect(await rows("select status from restaurant_tables where number=16")).toEqual([{ status: "occupied" }]);
  });

  it("recusa mesa desativada ou inexistente e números acima de 999", async () => {
    await db.exec("update restaurant_tables set active=false where number=40");
    await expect(db.exec("select public.open_table_tab(40,'Bia',2,null)")).rejects.toThrow(/desativada/);
    await expect(db.exec("select public.open_table_tab(77,'Bia',2,null)")).rejects.toThrow(/inválida/);
    await expect(db.exec("select public.group_restaurant_tables(array[1,40],null)")).rejects.toThrow(/válidas/);
    await expect(db.exec("insert into restaurant_tables(number,capacity) values(1000,4)")).rejects.toThrow();
    await db.exec("select public.set_table_status(40,'free',null,null)");
  });

  it("transfere comanda e junta mesas novas, e pode ser reaplicada", async () => {
    const [{ id }] = await rows<{ id: string }>("select id from tabs where table_number=16");
    await db.exec(`select public.transfer_tab('${id}',3,null)`);
    expect(await rows(`select table_number from tabs where id='${id}'`)).toEqual([{ table_number: 3 }]);
    const [{ g }] = await rows<{ g: string }>("select public.group_restaurant_tables(array[1,2,16],null) as g");
    expect(g).toBeTruthy();
    await db.exec(fs.readFileSync("supabase/migrations/041_configurable_restaurant_tables.sql", "utf8"));
  });
});
