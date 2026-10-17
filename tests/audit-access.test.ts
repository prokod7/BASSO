import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePublicCheckout } from '@/lib/public-checkout';
import { snapshotAccess } from '@/lib/operational-access';
import type { AuthContext, OperationalRole } from '@/lib/authz';

const mocks=vi.hoisted(()=>({auth:vi.fn(),admin:vi.fn()}));
vi.mock('@/lib/authz',()=>({requireOperationalRole:mocks.auth}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:mocks.admin}));
import { GET as snapshot } from '@/app/api/operational-snapshot/route';
import { POST as area } from '@/app/api/customer-area/route';
import { POST as bootstrap } from '@/app/api/auth/bootstrap/route';

function auth(role:OperationalRole,permissions:Record<string,boolean>={}):AuthContext{return {role,permissions,userId:'operator',displayName:'Teste'};}
function client(data:Record<string,any>){
 const from=vi.fn((table:string)=>{
  let result=data[table]??[];
  const builder:any={};
  for(const method of ['select','is','gt','not','order','limit','maybeSingle'])builder[method]=()=>builder;
  builder.eq=()=>builder;
  builder.in=(column:string,ids:string[])=>{if(Array.isArray(result))result=result.filter(row=>ids.includes(row[column]));return builder;};
  builder.then=(resolve:any,reject:any)=>Promise.resolve({data:result,error:null}).then(resolve,reject);
  return builder;
 });
 return {from};
}
beforeEach(()=>vi.clearAllMocks());
describe('limites de autorização',()=>{
 it.each(['waiter','kitchen','bar','driver'] as OperationalRole[])('não consulta nem retorna financeiro para %s',async role=>{
  const db=client({financial_entries:[{id:'private',amount_cents:90000}],cash_sessions:{id:'cash',initial_cents:20000},audit_logs:[{id:'audit'}],campaigns:[{id:'campaign'}]});
  mocks.auth.mockResolvedValue(auth(role));mocks.admin.mockReturnValue(db);
  const body=await (await snapshot()).json();
  expect(body.financialEntries).toEqual([]);expect(body.cashInitial).toBe(0);expect(body.cashMovements).toEqual([]);expect(body.audit).toEqual([]);expect(body.campaigns).toEqual([]);
  expect(db.from.mock.calls.map(x=>x[0])).not.toContain('financial_entries');expect(db.from.mock.calls.map(x=>x[0])).not.toContain('cash_sessions');
 });
 it('consulta financeiro do perfil financeiro, mas respeita revogação explícita',async()=>{
  mocks.auth.mockResolvedValue(auth('finance'));mocks.admin.mockReturnValue(client({financial_entries:[{id:'allowed',amount_cents:90000}]}));
  expect((await (await snapshot()).json()).financialEntries[0].id).toBe('allowed');
  mocks.auth.mockResolvedValue(auth('finance',{'finance.view':false,'cash.manage':false}));
  expect((await (await snapshot()).json()).financialEntries).toEqual([]);
 });
 it('carrega pagamentos parciais e preserva taxa de serviço zero',async()=>{
  mocks.auth.mockResolvedValue(auth('manager'));
  mocks.admin.mockReturnValue(client({orders:[{id:'partial',payment_status:'partial',total_cents:10000,status:'preparing'}],payments:[{order_id:'partial',amount_cents:6000,status:'paid'}],tabs:[{id:'tab',table_number:1,status:'open',service_charge_rate_percent:0}],restaurant_tables:[{number:1}]}));
  const body=await (await snapshot()).json();
  expect(body.orders[0]).toMatchObject({paidAmount:6000,balanceDue:4000});
  expect(body.tables[0].tabs[0].serviceChargeRate).toBe(0);
 });
 it('mantém todas as áreas disponíveis para gestor',()=>{
  expect(Object.values(snapshotAccess(auth('manager'))).every(Boolean)).toBe(true);
 });
 it('não redefine usuários por senha inicial',async()=>{
  const response=await bootstrap();expect(response.status).toBe(410);expect(mocks.admin).not.toHaveBeenCalled();
 });
 it('token de um pedido não autoriza todo o histórico do mesmo telefone',async()=>{
  const token='private-order-token-123456789';
  const hash=createHash('sha256').update(token).digest('hex');
  const db=client({order_access_tokens:[{order_id:'mine',token_hash:hash}],orders:[{id:'mine',number:1,total_cents:500,status:'received'},{id:'other',number:2,total_cents:10000,status:'completed'}]});
  mocks.admin.mockReturnValue(db);
  const response=await area(new NextRequest('https://basso.test/api/customer-area',{method:'POST',body:JSON.stringify({tokens:[token]})}));
  const body=await response.json();expect(body.orders.map((o:any)=>o.id)).toEqual(['mine']);expect(body.loyalty).toBeNull();
  expect(db.from.mock.calls.map(x=>x[0])).not.toContain('loyalty_accounts');expect(db.from.mock.calls.map(x=>x[0])).not.toContain('customers');
 });
 it('recusa token que não possui acesso',async()=>{
  mocks.admin.mockReturnValue(client({order_access_tokens:[]}));
  const response=await area(new NextRequest('https://basso.test/api/customer-area',{method:'POST',body:JSON.stringify({tokens:['unknown-private-token-123']})}));expect(response.status).toBe(401);
 });
 it('substitui campos operacionais forjados antes da validação pública',()=>{
  const now=new Date('2026-10-14T16:00:00Z');
  const value=parsePublicCheckout({id:'order-test',number:9000,channel:'pickup',status:'completed',paymentStatus:'paid',customerName:'Teste',customerPhone:'',items:[{}],subtotal:500,discount:0,deliveryFee:0,total:500,paymentMethod:'pix',createdAt:'invalid',updatedAt:'invalid',sourceIdempotencyKey:'request-test',customerId:'00000000-0000-4000-8000-000000000099',driverId:'other',tabId:'wrong',origin:'marketplace'},now);
  expect(value.status).toBe('received');expect(value.paymentStatus).toBe('pending');expect(value.createdAt).toBe(now.toISOString());expect(value.customerId).toBeUndefined();expect(value.tabId).toBeUndefined();expect(value.origin).toBe('web');
 });
});
