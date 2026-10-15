import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import raw from '@/data/catalog.json';
const read=(p:string)=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/034_saipos_prices_and_beverages.sql');
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 const core=read('supabase/migrations/001_core_schema.sql');
 await db.exec(core.match(/create type public.order_channel[^;]+;/)![0]);
 for(const table of ['pizza_flavors','products']) await db.exec(core.match(new RegExp(`create table public.${table} \\([\\s\\S]*?\\n\\);`))![0]);
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec('truncate pizza_flavors,products');
 const seed=read('supabase/migrations/002_official_catalog_seed.sql').split('\n').filter(line=>line.startsWith('insert into public.pizza_flavors')||line.startsWith('insert into public.products')).join('\n');
 await db.exec(seed);
});
it('aplica os 33 sabores e Coca-Cola, adiciona três bebidas e preserva os demais itens',async()=>{
 const before=await db.query<any>('select * from pizza_flavors order by id');
 await db.exec(migration);
 const after=await db.query<any>('select * from pizza_flavors order by id');
 expect(after.rows.filter((row,i)=>row.price_grande_cents!==before.rows[i].price_grande_cents)).toHaveLength(33);
 expect(after.rows.filter((row,i)=>row.price_broto_cents!==before.rows[i].price_broto_cents)).toHaveLength(31);
 for(const row of after.rows){
  const expected=raw.flavors.find(f=>f.id===row.id)!;
  expect([row.price_grande_cents,row.price_broto_cents]).toEqual([expected.priceGrande,expected.priceBroto]);
 }
 for(const id of ['coca-cola-1-l','coca-cola-zero-1-l','vinho-semi-seco','suco-de-uva-integral-1-l','heineken-zero-long-neck']){
  const row=(await db.query<any>('select * from products where id=$1',[id])).rows[0];
  expect(row.price_cents).toBe(raw.beverages.find(b=>b.id===id)!.price);
  expect(row.active).toBe(true);
 }
 const first=await db.query('select * from pizza_flavors order by id');
 const products=await db.query('select * from products order by id');
 await db.exec(migration);
 expect((await db.query('select * from pizza_flavors order by id')).rows).toEqual(first.rows);
 expect((await db.query('select * from products order by id')).rows).toEqual(products.rows);
});
it('interrompe sem alterações parciais quando há preço administrado após a conferência',async()=>{
 await db.exec("update pizza_flavors set price_grande_cents=9900 where id='chocolate'");
 await expect(db.exec(migration)).rejects.toThrow(/Preço alterado após conferência/);
 expect((await db.query<any>("select price_grande_cents from pizza_flavors where id='alho-e-oleo'")).rows[0].price_grande_cents).toBe(5000);
 expect((await db.query('select * from products where id=\'vinho-semi-seco\'')).rows).toHaveLength(0);
});
it('preserva tamanho sem reajuste, disponibilidade, combos e bebida já administrada',async()=>{
 await db.exec("update pizza_flavors set price_broto_cents=4100,active=false where id='escarola'");
 await db.exec("insert into products(id,name,category,price_cents) values('vinho-semi-seco','Vinho administrado','beverages',4700)");
 const combo=(await db.query("select * from products where category='combo'")).rows;
 await db.exec(migration);
 expect((await db.query<any>("select price_broto_cents,active from pizza_flavors where id='escarola'")).rows[0]).toEqual({price_broto_cents:4100,active:false});
 expect((await db.query<any>("select price_cents from products where id='vinho-semi-seco'")).rows[0].price_cents).toBe(4700);
 expect((await db.query("select * from products where category='combo'")).rows).toEqual(combo);
});
