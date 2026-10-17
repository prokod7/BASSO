import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
let db:PGlite;
const sql=fs.readFileSync('supabase/migrations/040_salon_drinks_catalog.sql','utf8');
beforeAll(async()=>{db=new PGlite();await db.exec(fs.readFileSync('tests/fixtures/operation-schema.sql','utf8'));await db.exec("insert into categories(id,name,kind) values('beverages','Bebidas','beverage');");await db.exec(sql);});
afterAll(async()=>db?.close());
describe('bebidas exclusivas do salão com valores do cardápio enviado',()=>{
 it('cadastra os dois chopps e as quatro marcas de balde com preços confirmados',async()=>{
  const {rows}=await db.query<any>('select id,price_cents,active from products order by id');expect(rows).toHaveLength(6);
  expect(rows.filter(x=>x.id.startsWith('chopp-')).map(x=>x.price_cents)).toEqual([2000,2000]);expect(rows.filter(x=>x.id.startsWith('balde-')).map(x=>x.price_cents)).toEqual([5500,5500,5500,5500]);expect(rows.every(x=>x.active)).toBe(true);
 });
 it('disponibiliza em mesa/garçom e não em delivery/retirada',async()=>{
  const {rows}=await db.query<any>('select array_to_json(available_channels) as channels from products');expect(rows.every(x=>JSON.stringify(x.channels)===JSON.stringify(['dine_in','table_qr']))).toBe(true);
 });
 it('é idempotente e não inventa taças/copos sem preço legível',async()=>{await db.exec(sql);const {rows}=await db.query<any>('select count(*)::int as count from products');expect(rows[0].count).toBe(6);});
});
