import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const one = async <T = Record<string, any>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const ts = () => String(Math.floor(Date.now() / 1000));
const msg = (id: string, body: string) => JSON.stringify({ id, from: "5511999998888", timestamp: ts(), type: "text", text: { body } });

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, citext } });
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create function auth.role() returns text language sql as $$select 'service_role'$$;
    create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
    create schema extensions; create publication supabase_realtime;`);
  for (const file of fs.readdirSync("supabase/migrations").filter((name) => /^\d{3}_/.test(name)).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
}, 180_000);
afterAll(async () => { await db?.close(); });

describe("migration 043 — robô do WhatsApp", () => {
  it("nasce desligado e sem acesso para anon/authenticated", async () => {
    expect(await one("select enabled,quiet_seconds,max_wait_seconds from wa_settings")).toEqual({ enabled: false, quiet_seconds: 15, max_wait_seconds: 90 });
    expect(await one("select has_table_privilege('anon','public.wa_sessions','select') a, has_function_privilege('authenticated','public.wa_claim()','execute') b")).toEqual({ a: false, b: false });
    expect(await one("select version from system_migrations where version=43")).toEqual({ version: 43 });
    expect(await one("select public.wa_claim() c")).toEqual({ c: null });
  });

  it("recebe, agrupa e responde a primeira mensagem na hora; deduplica pelo ID da Meta", async () => {
    await db.exec("update wa_settings set enabled=true");
    await db.query("select public.wa_log_message('5511999998888','m1','oi','text','in','customer','Ana',null)");
    await db.query("select public.wa_receive('5511999998888','m1',$1::jsonb,false)", [msg("m1", "oi")]);
    await db.query("select public.wa_receive('5511999998888','m1',$1::jsonb,false)", [msg("m1", "oi")]);
    await db.query("select public.wa_receive('5511999998888','m2',$1::jsonb,false)", [msg("m2", "quero pizza")]);
    expect(await one("select count(*)::int n from wa_jobs")).toEqual({ n: 2 });
    const claim = (await one<{ c: any }>("select public.wa_claim() c")).c;
    expect(claim.jobs).toHaveLength(2);
    expect(claim.session.phone).toBe("5511999998888");
    const step = (op: string, b: object = {}) => one<{ r: any }>("select public.wa_transition($1,$2,$3,$4::jsonb) r", [claim.job.id, claim.lease, op, JSON.stringify(b)]);
    await step("stage", { pending: null, history: [{ role: "user", content: "oi" }], response: "Olá! 🍕", usage: {}, pause: false });
    expect((await one("select state from wa_jobs where message_id='m1'")).state).toBe("merged");
    await step("sending");
    await step("sent", { outbound_id: "out1", pause: false });
    expect(await one("select state,outbound_id from wa_jobs where message_id='m2'")).toEqual({ state: "sent", outbound_id: "out1" });
    expect(await one("select author,body from wa_messages where wa_id='out1'")).toEqual({ author: "bot", body: "Olá! 🍕" });
    expect(await one("select lease from wa_sessions")).toEqual({ lease: null });
  });

  it("depois da primeira resposta espera o cliente parar de digitar", async () => {
    await db.query("select public.wa_receive('5511999998888','m3',$1::jsonb,false)", [msg("m3", "uma calabresa")]);
    const claim = (await one<{ c: any }>("select public.wa_claim() c")).c;
    expect(claim.wait).toBeGreaterThan(10);
    await db.exec("update wa_jobs set created_at=now()-interval '20 seconds' where message_id='m3'");
    expect((await one<{ c: any }>("select public.wa_claim() c")).c.jobs).toHaveLength(1);
  });

  it("confirma só o resumo pendente (código e validade) e exige comprovante no Pix", async () => {
    await db.exec("update wa_sessions set lease=null,lease_until=null");
    await db.exec("update wa_jobs set state='queued',attempts=0 where message_id='m3'");
    await db.exec("update wa_jobs set created_at=now()-interval '20 seconds' where message_id='m3'");
    const claim = (await one<{ c: any }>("select public.wa_claim() c")).c;
    const step = (op: string, b: object = {}) => db.query("select public.wa_transition($1,$2,$3,$4::jsonb) r", [claim.job.id, claim.lease, op, JSON.stringify(b)]);
    const pending = { code: "AB12", expires: new Date(Date.now() + 600000).toISOString(), basket: { paymentMethod: "cash" }, quote: { total: 5000 } };
    await db.query("update wa_sessions set pending=$1::jsonb", [JSON.stringify(pending)]);
    await expect(step("check", { code: "ZZZZ" })).rejects.toThrow(/CONFIRMATION_REQUIRED/);
    await step("check", { code: "AB12" });
    await db.query("update wa_sessions set pending=$1::jsonb", [JSON.stringify({ ...pending, basket: { paymentMethod: "pix" } })]);
    await expect(step("check", { code: "AB12" })).rejects.toThrow(/PIX_RECEIPT_REQUIRED/);
    await db.query("update wa_sessions set pending=$1::jsonb", [JSON.stringify({ ...pending, basket: { paymentMethod: "pix" }, awaiting_receipt: true })]);
    await step("check", { code: "AB12", pix_receipt: "R$ 50,00" });
    await step("committed", { order: { id: "o1", number: 7 } });
    expect(await one("select pending from wa_sessions")).toEqual({ pending: null });
    expect((await one<{ r: any }>("select public.wa_transition($1,$2,'check','{\"code\":\"AB12\"}'::jsonb) r", [claim.job.id, claim.lease])).r).toEqual({ order: { id: "o1", number: 7 } });
    await expect(db.query("select public.wa_transition($1,gen_random_uuid(),'sending','{}'::jsonb)", [claim.job.id])).rejects.toThrow(/LEASE_LOST/);
  });

  it("eco do celular pausa o robô; devolver ao robô relê a conversa", async () => {
    const session = await one<{ id: string }>("select id from wa_sessions");
    await db.query("select public.wa_receive('5511999998888','echo1',$1::jsonb,true)", [JSON.stringify({ id: "echo1", to: "5511999998888", timestamp: String(Number(ts()) + 60) })]);
    expect(await one("select paused,pending from wa_sessions")).toEqual({ paused: true, pending: null });
    await db.query("select public.wa_control_session($1,false)", [session.id]);
    const resumed = await one<{ paused: boolean; history: Array<{ role: string; content: string }> }>("select paused,history from wa_sessions");
    expect(resumed.paused).toBe(false);
    expect(resumed.history).toEqual(expect.arrayContaining([{ role: "user", content: "oi" }, { role: "assistant", content: "Olá! 🍕" }]));
    const inbox = (await one<{ i: any[] }>("select public.wa_inbox() i")).i;
    expect(inbox[0]).toMatchObject({ phone: "5511999998888", name: "Ana" });
  });

  it("lembrete do cardápio sai uma vez e não repete para quem já recebeu o link", async () => {
    const session = await one<{ id: string }>("select id from wa_sessions");
    await db.query("select public.wa_arm_follow_up($1)", [session.id]);
    await db.exec("update wa_sessions set follow_up_at=now()-interval '1 second'");
    expect(((await one<{ d: any[] }>("select public.wa_due_follow_ups() d")).d)).toHaveLength(1);
    expect(((await one<{ d: any[] }>("select public.wa_due_follow_ups() d")).d)).toHaveLength(0);
    await db.exec("update wa_sessions set follow_up_at=now()-interval '1 second',followed_up_at=null,menu_sent_at=now()");
    expect(((await one<{ d: any[] }>("select public.wa_due_follow_ups() d")).d)).toHaveLength(0);
    expect(await one("select follow_up_at from wa_sessions")).toEqual({ follow_up_at: null });
  });
});

describe("migration 044 — saudação automática do WhatsApp Business", () => {
  it("eco no mesmo segundo da mensagem do cliente não pausa; eco depois pausa", async () => {
    const p = "5511977776666";
    const now = Math.floor(Date.now() / 1000);
    const at = (s: number) => new Date(s * 1000).toISOString();
    await db.query("select public.wa_log_message($1,'c1','boa tarde','text','in','customer',null,$2)", [p, at(now)]);
    await db.query("select public.wa_receive($1,'auto1',$2::jsonb,true)", [p, JSON.stringify({ id: "auto1", to: p, timestamp: String(now) })]);
    expect(await one("select paused from wa_sessions where phone=$1", [p])).toEqual({ paused: false });
    await db.query("select public.wa_receive($1,'human1',$2::jsonb,true)", [p, JSON.stringify({ id: "human1", to: p, timestamp: String(now + 120) })]);
    expect(await one("select paused from wa_sessions where phone=$1", [p])).toEqual({ paused: true });
  });

  it("eco automático que chega antes da mensagem do cliente é desfeito", async () => {
    const p = "5511955554444";
    const now = Math.floor(Date.now() / 1000);
    await db.query("select public.wa_receive($1,'auto2',$2::jsonb,true)", [p, JSON.stringify({ id: "auto2", to: p, timestamp: String(now) })]);
    expect(await one("select paused from wa_sessions where phone=$1", [p])).toEqual({ paused: true });
    await db.query("select public.wa_receive($1,'c2',$2::jsonb,false)", [p, JSON.stringify({ id: "c2", from: p, timestamp: String(now), type: "text", text: { body: "oi" } })]);
    expect(await one("select paused from wa_sessions where phone=$1", [p])).toEqual({ paused: false });
  });
});

describe("migration 048 — devolver ao robô com contexto", () => {
  it("inclui o que o atendente escreveu e responde o que o cliente mandou depois", async () => {
    const p = "5511933332222";
    const at = (offset: number) => new Date(Date.now() + offset * 1000).toISOString();
    await db.query("select public.wa_log_message($1,'r1','quero uma pizza','text','in','customer','Bia',$2)", [p, at(-300)]);
    await db.query("select public.wa_log_message($1,'r2','Claro! Qual sabor?','text','out','agent',null,$2)", [p, at(-200)]);
    await db.query("select public.wa_log_message($1,'r3','calabresa','text','in','customer',null,$2)", [p, at(-100)]);
    await db.query("select public.wa_receive($1,'r3',$2::jsonb,false)", [p, JSON.stringify({ id: "r3", from: p, timestamp: String(Math.floor(Date.now() / 1000) - 100), type: "text", text: { body: "calabresa" } })]);
    const session = await one<{ id: string }>("select id from wa_sessions where phone=$1", [p]);
    await db.query("select public.wa_control_session($1,true)", [session.id]);
    expect(await one("select state from wa_jobs where message_id='r3'")).toEqual({ state: "skipped" });
    await db.query("select public.wa_control_session($1,false)", [session.id]);
    const row = await one<{ history: Array<{ role: string; content: string }> }>("select history from wa_sessions where id=$1", [session.id]);
    expect(row.history).toEqual([{ role: "user", content: "quero uma pizza" }, { role: "assistant", content: "[Atendente da loja]: Claro! Qual sabor?" }]);
    expect(await one("select state from wa_jobs where message_id='r3'")).toEqual({ state: "queued" });
  });
});
