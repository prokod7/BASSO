import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { itemDetails, compactItemName } from '@/lib/item-presentation';
import { presentPrintJob } from '@/lib/print-presentation';
import type { CartItem, PizzaSelection } from '@/types';

const selection: PizzaSelection = { size: 'grande', mass: 'traditional', flavorA: 'baiana', flavorB: 'troiana', removedA: ['molho de pimenta'], removedB: ['parmesão'], addons: { 'custom-addon': 1, bacon: 1 }, addonPlacements: { 'custom-addon': 'halfA', bacon: 'whole' }, notes: 'Trocar azeitonas', labels: { 'custom-addon': 'Queijo coalho especial' } };
const pizza: CartItem = { id: 'pizza-test', quantity: 1, unitPrice: 6000, kind: 'pizza', name: 'Pizza Grande • Baiana / Troiana', selection };
describe('detalhes e impressão dos pedidos', () => {
 it('agrupa retirada e adicional logo abaixo do sabor correto', () => {
  const lines = itemDetails(pizza).map(x => x.text);
  const a = lines.indexOf('½ Baiana'), b = lines.indexOf('½ Troiana');
  expect(lines[a + 1]).toBe('  SEM molho de pimenta');
  expect(lines[a + 2]).toBe('  + 1x Queijo coalho especial');
  expect(lines[b + 1]).toBe('  SEM parmesão');
  expect(lines.filter(x => x.includes('pizza inteira'))).toHaveLength(1);
  expect(compactItemName(pizza)).toBe('Pizza Grande');
 });
 it('resolve nomes persistidos e não duplica bebida do combo', () => {
  const lines = itemDetails({ selection: { grandeFlavor: 'baiana', beverage: 'custom-drink', addons: {}, labels: { 'custom-drink': 'Chopp da casa' } } as any });
  expect(lines.filter(x => x.text.includes('Chopp da casa'))).toHaveLength(1);
 });
 it('entrega ao bridge o mesmo detalhamento e número diário', () => {
  const job = presentPrintJob({ payload: { order: { number: 10040, daily_number: 3 }, items: [{ ...pizza, name_snapshot: pizza.name }] } });
  expect(job.payload.order.number).toBe(3);
  expect(job.payload.items[0].display_name).toBe('Pizza Grande');
  expect(job.payload.items[0].detail_lines).toEqual(itemDetails(pizza));
 });
});

describe('mesas vazias e numeração diária em PostgreSQL isolado', () => {
 let db: PGlite;
 beforeAll(async () => {
  db = new PGlite();
  for (const path of ['tests/fixtures/operation-schema.sql', 'supabase/migrations/038_salon_receipts_daily_numbers.sql']) await db.exec(fs.readFileSync(path, 'utf8'));
  await db.exec(`insert into restaurant_tables(number,capacity,status) values(1,5,'occupied'),(2,5,'occupied');`);
 });
 afterAll(async () => db?.close());
 const insert = (id: string, date: string, extra = '') => db.exec(`insert into orders(id,number,channel,status,payment_status,customer_name,customer_phone,subtotal_cents,total_cents,payment_method,source_idempotency_key,created_at${extra ? ',tab_id' : ''}) values('${id}',${Number(id.slice(1))},'counter','received','pending','Teste local','',500,500,'pix','${id}','${date}'${extra ? `,'${extra}'` : ''});`);
 it('reinicia à meia-noite de São Paulo, preservando número permanente', async () => {
  await insert('o1','2026-10-17T02:59:59Z');
  await insert('o2','2026-10-17T03:00:00Z');
  await insert('o3','2026-10-17T03:00:01Z');
  const r = await db.query<{number: number; daily_number: number}>('select number,daily_number from orders order by number');
  expect(r.rows.map(x => Number(x.daily_number))).toEqual([1,1,2]);
  expect(r.rows.map(x => Number(x.number))).toEqual([1,2,3]);
 });
 it('serializa pedidos simultâneos sem repetir número diário', async () => {
  await Promise.all([insert('o4','2026-10-17T04:00:00Z'),insert('o5','2026-10-17T04:00:00Z')]);
  const r=await db.query('select daily_number from orders where id in (\'o4\',\'o5\') order by daily_number');
  expect(r.rows.map((x:any)=>x.daily_number)).toEqual([3,4]);
 });
 it('encerra comanda vazia e libera a mesa sem criar pagamento', async () => {
  await db.exec(`insert into tabs(id,table_number,name) values('00000000-0000-4000-8000-000000000001',1,'Vazia');select set_table_status(1,'free',0,null);`);
  expect((await db.query('select status from tabs where table_number=1')).rows[0]).toEqual({ status:'closed' });
  expect((await db.query('select status from restaurant_tables where number=1')).rows[0]).toEqual({ status:'free' });
  expect((await db.query('select count(*)::integer as n from payments')).rows[0]).toEqual({ n:0 });
 });
 it('bloqueia encerramento com consumo e mantém a mesa aberta', async () => {
  const tab='00000000-0000-4000-8000-000000000002';
  await db.exec(`insert into tabs(id,table_number,name) values('${tab}',2,'Com consumo');`);
  await insert('o6','2026-10-17T04:00:00Z',tab);
  await expect(db.exec(`select set_table_status(2,'free',0,null)`)).rejects.toThrow('consumo');
  expect((await db.query('select status from restaurant_tables where number=2')).rows[0]).toEqual({ status:'occupied' });
 });
 it('bloqueia fechamento de comanda com recebimento mesmo sem pedidos', async () => {
  await db.exec(`update tabs set paid_cents=100 where table_number=2;update orders set status='cancelled' where id='o6';`);
  await expect(db.exec(`select set_table_status(2,'free',0,null)`)).rejects.toThrow('pagamentos');
 });
 it('proíbe execução do fechamento por clientes públicos', async () => {
  const r=await db.query(`select has_function_privilege('anon','public.set_table_status(integer,text,integer,uuid)','execute') as allowed`);
  expect(r.rows[0]).toEqual({allowed:false});
 });
});
