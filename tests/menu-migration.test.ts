import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect } from "vitest";
import { catalog } from "@/lib/catalog";
const read = (p: string) => fs.readFileSync(p, "utf8");
let db: PGlite;
const migration = read("supabase/migrations/033_menu_autonomy_and_offers.sql");
beforeAll(async () => {
  db = new PGlite();
  await db.exec(read("tests/fixtures/operation-schema.sql"));
  await db.exec(read("tests/fixtures/operation-functions-031.sql"));
  await db.exec(read("supabase/migrations/032_audit_operation_integrity.sql"));
  await db.exec(
    "create table public.pizza_flavors(id text primary key,category text not null); insert into public.categories(id,name,kind) values('combo','Combos','combo');",
  );
  for (const f of catalog.flavors)
    await db.query("insert into public.pizza_flavors values($1,$2)", [
      f.id,
      f.category,
    ]);
  const promo = read(
    "supabase/migrations/029_final_waiter_payments_promotions.sql",
  );
  await db.exec(
    promo.slice(
      promo.indexOf("create table if not exists public.promotions"),
      promo.indexOf(
        "create unique index if not exists promotion_targets_product_unique",
      ),
    ),
  );
  await db.exec(migration);
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("cadastra 8/16/21 sabores exatos e preços e canais das ofertas oficiais", async () => {
  const result = await db.query<{
    name: string;
    promo_price_cents: number;
    channels: string[];
    count: number;
  }>(
    "select p.name,p.promo_price_cents,array_to_json(p.channels) as channels,count(t.id)::int from promotions p join promotion_targets t on t.promotion_id=p.id group by p.id order by p.promo_price_cents",
  );
  expect(result.rows.map((r) => [r.promo_price_cents, r.count])).toEqual([
    [3999, 8],
    [4499, 16],
    [4990, 21],
  ]);
  expect(
    result.rows.every((r) => r.channels.join(",") === "own_delivery,pickup"),
  ).toBe(true);
});
it("cadastra combos Premium 1 e 2 com composição e refrigerantes oficiais", async () => {
  const r = await db.query<any>(
    "select price_cents,config from products where category='combo' order by price_cents",
  );
  expect(
    r.rows.map((r) => [
      r.price_cents,
      r.config.grandeQuantity,
      r.config.sweetSize,
    ]),
  ).toEqual([
    [15590, 1, "broto"],
    [26990, 2, "grande"],
  ]);
  expect(r.rows[0].config.beverages).toHaveLength(5);
  expect(r.rows[0].config.sweetFlavors).toHaveLength(10);
});
it("reaplicar não sobrescreve preço administrado nem duplica ofertas", async () => {
  await db.exec(
    "update products set price_cents=16000 where id='combo-premium-1'; update promotions set promo_price_cents=4100 where name='Terça Maluca'",
  );
  await db.exec(migration);
  expect(
    (
      await db.query<any>(
        "select price_cents from products where id='combo-premium-1'",
      )
    ).rows[0].price_cents,
  ).toBe(16000);
  expect(
    (await db.query<any>("select count(*)::int n from promotions")).rows[0].n,
  ).toBe(3);
  expect(
    (
      await db.query<any>(
        "select promo_price_cents from promotions where name='Terça Maluca'",
      )
    ).rows[0].promo_price_cents,
  ).toBe(4100);
});
it("trigger aceita broto salgada e bloqueia doce/misto, inclusive edição direta", async () => {
  await db.exec(
    "insert into orders(id,number,channel,status,customer_name,customer_phone,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,payment_method,source_idempotency_key) values('broto',1,'counter','received','Teste','',1000,0,0,1000,'pix','broto-test')",
  );
  await db.query(
    "insert into order_items(id,order_id,kind,name_snapshot,quantity,unit_price_cents,selection) values('b1','broto','pizza','Broto',1,1000,$1::jsonb)",
    [
      JSON.stringify({
        size: "broto",
        flavorA: "mozzarella",
        flavorB: "camarao",
      }),
    ],
  );
  await expect(
    db.exec(
      "update order_items set selection=selection||'{\"flavorB\":\"chocolate\"}'::jsonb where id='b1'",
    ),
  ).rejects.toThrow(/Broto doce/);
  await expect(
    db.exec(
      "update order_items set selection=selection||'{\"flavorB\":\"ausente\"}'::jsonb where id='b1'",
    ),
  ).rejects.toThrow();
});
