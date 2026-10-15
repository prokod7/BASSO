import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),'utf8');
const actor='00000000-0000-4000-8000-000000000001';
const tabId='00000000-0000-4000-8000-000000000002';
let db:PGlite;
async function value(sql:string,args:any[]=[]):Promise<any>{const r=await db.query(sql,args);return r.rows[0] ? Object.values(r.rows[0] as object)[0] : undefined;}
async function row(table:string,id:string){return value(`select to_jsonb(t) from public.${table} t where id=$1`,[id]);}
function order(id:string,extra:Record<string,unknown>={}) {return {
  id,number:1,channel:'counter',status:'received',paymentStatus:'pending',customerName:'Teste local',customerPhone:'',
  items:[{id:id+'-item',kind:'product',name:'Água',productId:'water',quantity:1,unitPrice:500}],
  subtotal:500,discount:0,deliveryFee:0,total:500,paymentMethod:'pix',
  createdAt:'2026-10-14T15:00:00Z',updatedAt:'2026-10-14T15:00:00Z',sourceIdempotencyKey:id+'-request',...extra};}
async function create(id:string,extra:Record<string,unknown>={}){
 return value('select public.create_internal_order_transaction($1::jsonb,null,$2::uuid,null)',[JSON.stringify(order(id,extra)),actor]);
}
async function add(id:string,itemId:string,qty=1){return value('select public.add_order_item_transaction($1,$2::jsonb,$3::uuid)',[id,JSON.stringify({id:itemId,kind:'product',name:'Água',productId:'water',quantity:qty,unitPrice:500}),actor]);}
async function modify(id:string,itemId:string,action:string,payload:object={}) {return value('select public.manage_order_item_transaction($1,$2,$3,$4::jsonb,$5,$6::uuid)',[id,itemId,action,JSON.stringify(payload),'Teste de alteração',actor]);}
async function tabOrder(id='tab-order') {
 await db.exec(`insert into public.tabs(id,table_number,name,service_charge_applied) values('${tabId}',1,'Mesa teste',false); update public.restaurant_tables set status='occupied' where number=1;`);
 await create(id,{channel:'dine_in',tabId,tableNumber:1});
}
async function payTab(key:string,amount:number,method='pix') {return value('select public.record_tab_payment($1::uuid,$2,$3::public.payment_method,$4,$5::uuid)',[tabId,amount,method,key,actor]);}

describe('auditoria 032 — transações PostgreSQL em ambiente isolado',()=>{
 beforeAll(async()=>{
  db=new PGlite();
  await db.exec(read('tests/fixtures/operation-schema.sql'));
  await db.exec(read('tests/fixtures/operation-functions-031.sql'));
  // Same double numbering triggers observed in production, removed by migration 032.
  await db.exec(`create function public.assign_order_number() returns trigger language plpgsql as $$begin new.number:=nextval('public.order_number_seq');return new;end$$;
    create function public.assign_order_number_server_side() returns trigger language plpgsql as $$begin new.number:=nextval('public.order_number_seq');return new;end$$;
    create trigger orders_assign_number before insert on public.orders for each row execute function public.assign_order_number();
    create trigger orders_assign_number_server_side before insert on public.orders for each row execute function public.assign_order_number_server_side();`);
  const old=read('supabase/migrations/009_internal_orders_and_tabs.sql');
  const open=old.match(/create or replace function public.open_table_tab\([\s\S]*?end \$\$;/i)?.[0];
  if(!open)throw new Error('Fixture open_table_tab ausente');
  await db.exec(open);
  await db.exec(read('supabase/migrations/032_audit_operation_integrity.sql'));
 });
 afterAll(async()=>{await db?.close();});
 beforeEach(async()=>{
  await db.exec(`truncate public.orders, public.products, public.profiles, public.restaurant_tables, public.cash_sessions, public.print_profiles cascade;
    insert into auth.users(id) values('${actor}') on conflict do nothing;
    insert into public.profiles(id,display_name,role) values('${actor}','Operador teste','manager');
    insert into public.restaurant_tables(number,capacity) values(1,2),(2,2);
    insert into public.categories(id,name,kind) values('beverages','Bebidas','beverage') on conflict do nothing;
    insert into public.products(id,name,category,price_cents,stock_tracked) values('water','Água','beverages',500,true);
    insert into public.inventory_items(product_id,quantity,allow_negative) values('water',10,false);`);
 });
 it('normaliza status, pagamento e datas do checkout também no banco',async()=>{
  const forged=order('public-test',{channel:'pickup',status:'completed',paymentStatus:'paid',createdAt:'2020-01-01T00:00:00Z'});
  await value('select public.create_order_transaction($1::jsonb)',[JSON.stringify(forged)]);
  const x=await row('orders','public-test');expect(x.status).toBe('received');expect(x.payment_status).toBe('pending');expect(x.created_at).not.toContain('2020');
 });
 it('reutiliza ID original em retry com chave igual e ID de navegador diferente',async()=>{
  await create('retry-one');const result=await value('select public.create_internal_order_transaction($1::jsonb,null,$2::uuid,null)',[JSON.stringify(order('retry-two',{sourceIdempotencyKey:'retry-one-request'})),actor]);
  expect(result.id).toBe('retry-one');expect(result.duplicate).toBe(true);expect(await value('select quantity from inventory_items')).toBe('9.000');
 });
 it('restaura criação de comanda no pedido por QR',async()=>{
  await value('select public.create_order_transaction($1::jsonb)',[JSON.stringify(order('qr-local',{channel:'table_qr',tableNumber:1,tabName:'Participante'}))]);
  const x=await row('orders','qr-local');expect(x.tab_id).toBeTruthy();expect(await value('select status from restaurant_tables where number=1')).toBe('occupied');
 });
 it('não vincula comanda de outra mesa',async()=>{
  await tabOrder();await expect(create('wrong-table',{channel:'dine_in',tabId,tableNumber:2})).rejects.toThrow(/Comanda/);
 });
 it('recusa venda paga em dinheiro com caixa fechado, sem gravar pedido/estoque',async()=>{
  await expect(create('cash-closed',{paymentStatus:'paid',paymentMethod:'cash'})).rejects.toThrow(/Abra o caixa/);
  expect(await value('select count(*) from orders')).toBe(0);expect(await value('select quantity from inventory_items')).toBe('10.000');expect(await value('select count(*) from payments')).toBe(0);
 });
 it('lança dinheiro uma vez e permite repetir após fechamento de caixa',async()=>{
  await value('select public.open_cash_session(1000,$1::uuid)',[actor]);await create('cash-ok',{paymentStatus:'paid',paymentMethod:'cash'});
  expect(await value('select sum(amount_cents) from cash_movements')).toBe(500);
  await value('select public.close_cash_session(1500,null,$1::uuid)',[actor]);
  expect((await create('cash-ok',{paymentStatus:'paid',paymentMethod:'cash'})).duplicate).toBe(true);
  expect(await value('select count(*) from payments')).toBe(1);
 });
 it('garante apenas um caixa aberto mesmo com INSERT fora da RPC',async()=>{
  await value('select public.open_cash_session(0,$1::uuid)',[actor]);
  await expect(db.query('insert into cash_sessions(opened_by,initial_cents) values($1,0)',[actor])).rejects.toThrow(/cash_sessions_single_open/);
 });
 it('reconcilia inclusão, quantidade, cancelamento e restauração sem baixa duplicada',async()=>{
  await create('stock-test');await add('stock-test','new-water');expect(await value('select quantity from inventory_items')).toBe('8.000');
  await add('stock-test','new-water');expect(await value('select quantity from inventory_items')).toBe('8.000');
  await modify('stock-test','new-water','quantity',{quantity:2});expect(await value('select quantity from inventory_items')).toBe('7.000');
  await modify('stock-test','new-water','cancel');expect(await value('select quantity from inventory_items')).toBe('9.000');
  await modify('stock-test','new-water','restore');expect(await value('select quantity from inventory_items')).toBe('7.000');
  expect((await row('orders','stock-test')).total_cents).toBe(1500);
 });
 it('rollback preserva quantidade/total/saldo quando falta estoque',async()=>{
  await create('stock-fail');await expect(modify('stock-fail','stock-fail-item','quantity',{quantity:20})).rejects.toThrow(/Estoque insuficiente/);
  expect((await row('orders','stock-fail')).total_cents).toBe(500);expect((await row('order_items','stock-fail-item')).quantity).toBe(1);expect(await value('select quantity from inventory_items')).toBe('9.000');
 });
 it('fila e item são atômicos e a repetição não duplica impressão',async()=>{
  await db.exec("insert into print_profiles(key,name,sector,active,auto_print) values('counter','Balcão','counter',true,true)");
  await create('print-test');await add('print-test','print-new');await add('print-test','print-new');
  expect(await value("select count(*) from print_jobs where source_key like 'print-test:item:%'")).toBe(1);
  await db.exec(`create function public.test_print_failure() returns trigger language plpgsql as $$begin raise exception 'Impressora teste indisponível';end$$;
    create trigger test_print_failure before insert on public.print_jobs for each row execute function public.test_print_failure();`);
  try {await expect(add('print-test','print-fails')).rejects.toThrow(/Impressora teste/);expect(await row('order_items','print-fails')).toBeUndefined();expect(await value('select quantity from inventory_items')).toBe('8.000');}
  finally {await db.exec('drop trigger test_print_failure on print_jobs; drop function public.test_print_failure();');}
 });
 it('bloqueia alteração de consumo após recebimento',async()=>{
  await create('paid-order',{paymentStatus:'paid'});
  await expect(modify('paid-order','paid-order-item','quantity',{quantity:2})).rejects.toThrow(/recebimento/);
  await expect(add('paid-order','extra-paid')).rejects.toThrow(/recebimento/);
  await modify('paid-order','paid-order-item','notes',{notes:'Sem gelo'});
 });
 it('bloqueia alteração de pedido encerrado',async()=>{
  await create('closed-order',{status:'completed',paymentStatus:'paid'});
  await expect(modify('closed-order','closed-order-item','cancel')).rejects.toThrow(/encerrado/);
 });
 it('replay parcial ou integral de comanda retorna o resultado original',async()=>{
  await tabOrder();const first=await payTab('payment-partial',200);expect(first.closed).toBe(false);
  expect((await payTab('payment-partial',200)).duplicate).toBe(true);
  const last=await payTab('payment-final',300);expect(last.closed).toBe(true);
  const repeated=await payTab('payment-final',300);expect(repeated.paymentId).toBe(last.paymentId);expect(repeated.closed).toBe(true);expect(repeated.duplicate).toBe(true);
  expect((await payTab('payment-partial',200)).paidCents).toBe(first.paidCents);
  expect(await value('select count(*) from payments')).toBe(2);
 });
 it('não permite reusar chave com outro valor',async()=>{
  await tabOrder();await payTab('payment-existing',200);await expect(payTab('payment-existing',300)).rejects.toThrow(/Chave/);
 });
 it('bloqueia edição e cancelamento de comanda parcialmente recebida',async()=>{
  await tabOrder();await payTab('payment-started',200);
  await expect(add('tab-order','partial-extra')).rejects.toThrow(/recebimento/);
  await expect(value('select public.manage_tab_transaction($1::uuid,\'cancel\',null,\'Teste\',$2::uuid)',[tabId,actor])).rejects.toThrow(/recebimento/);
 });
 it('cancela pedidos sem recebimento, devolve estoque e libera mesa em transação',async()=>{
  await tabOrder();await value('select public.manage_tab_transaction($1::uuid,\'cancel\',null,\'Teste\',$2::uuid)',[tabId,actor]);
  expect((await row('orders','tab-order')).status).toBe('cancelled');expect((await row('tabs',tabId)).status).toBe('cancelled');expect(await value('select status from restaurant_tables where number=1')).toBe('free');expect(await value('select quantity from inventory_items')).toBe('10.000');
 });
 it('não libera mesa que ainda tem outra comanda aberta',async()=>{
  await tabOrder();await db.exec("insert into tabs(table_number,name) values(1,'Outro cliente')");
  await value('select public.manage_tab_transaction($1::uuid,\'cancel\',null,\'Teste\',$2::uuid)',[tabId,actor]);
  expect(await value('select status from restaurant_tables where number=1')).toBe('occupied');
 });
 it('verifica versão dentro da transação antes de alterar estado',async()=>{
  await create('cas-order');await value("select public.change_order_status_controlled($1,'confirmed',null,$2::uuid,1)",['cas-order',actor]);
  await expect(value("select public.change_order_status_controlled($1,'preparing',null,$2::uuid,1)",['cas-order',actor])).rejects.toThrow(/ORDER_VERSION_CONFLICT/);
  expect((await row('orders','cas-order')).status).toBe('confirmed');
 });
 it('altera desconto/taxa em transação e impede mudança após pagamento',async()=>{
  await create('money-edit');
  const x=await value('select public.update_order_transaction($1,$2::jsonb,$3,$4::uuid,$5)', ['money-edit',JSON.stringify({discount_cents:100,delivery_fee_cents:50}),'Teste',actor,1]);
  expect(x.total_cents).toBe(450);expect(await value('select quantity from inventory_items')).toBe('9.000');
  await create('money-paid',{paymentStatus:'paid'});
  await expect(value('select public.update_order_transaction($1,$2::jsonb,$3,$4::uuid,$5)',['money-paid',JSON.stringify({discount_cents:100}),'Teste',actor,1])).rejects.toThrow(/recebimento/);
 });
 it('não permite redefinir taxa de serviço após receber parcela da comanda',async()=>{
  await tabOrder();await payTab('service-charge-paid',100);
  await expect(value('select public.set_tab_service_charge($1::uuid,false,$2::uuid)',[tabId,actor])).rejects.toThrow(/antes de iniciar/);
 });
 it('consome apenas um número da sequência por pedido',async()=>{
  await create('number-first');await create('number-second');expect((await row('orders','number-second')).number-(await row('orders','number-first')).number).toBe(1);
 });
 it('nega escrita direta de comandas e execução das RPCs privilegiadas ao navegador',async()=>{
  expect(await value("select has_table_privilege('authenticated','public.tabs','UPDATE')")).toBe(false);
  expect(await value("select has_table_privilege('authenticated','public.restaurant_tables','DELETE')")).toBe(false);
  expect(await value("select has_function_privilege('authenticated','public.add_order_item_transaction(text,jsonb,uuid)','EXECUTE')")).toBe(false);
  expect(await value("select has_function_privilege('anon','public.manage_tab_transaction(uuid,text,text,text,uuid)','EXECUTE')")).toBe(false);
 });
});
