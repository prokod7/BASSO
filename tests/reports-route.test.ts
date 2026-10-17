import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({tables:{} as Record<string,any[]>,calls:[] as any[]}));
vi.mock('@/lib/authz',()=>({requireOperationalRole:vi.fn(async()=>({role:'manager'}))}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 const query:any={then:(resolve:any,reject:any)=>Promise.resolve({data:state.tables[table]||[],error:null}).then(resolve,reject)};
 for(const method of ['select','is','gte','lte','order','limit'])query[method]=(...args:any[])=>{state.calls.push({table,method,args});return query;};
 return query;
}})}));
import {GET} from '@/app/api/reports/route';
beforeEach(()=>{state.calls=[];state.tables={orders:[{id:'paid',number:10040,daily_number:2,channel:'pickup',status:'completed',payment_status:'paid',payment_method:'pix',total_cents:2000,discount_cents:0,delivery_fee_cents:0,created_at:'2026-10-17T02:30:00Z'}],order_items:[{order_id:'paid',name_snapshot:'Pizza',quantity:2,unit_price_cents:1000,selection:{addons:{bacon:1}},production_status:'ready'},{order_id:'paid',name_snapshot:'Item cancelado',quantity:1,unit_price_cents:500,production_status:'cancelled'}]};});
describe('relatórios: consulta, agregação e exportação',()=>{
 it('consulta o dia comercial completo e soma adicionais por quantidade de pizzas',async()=>{
  const result=await GET(new NextRequest('http://localhost/api/reports?start=2026-10-16&end=2026-10-16'));
  const body=await result.json();expect(result.status).toBe(200);
  expect(state.calls).toContainEqual({table:'orders',method:'gte',args:['created_at','2026-10-16T03:00:00.000Z']});
  expect(state.calls).toContainEqual({table:'orders',method:'lte',args:['created_at','2026-10-17T02:59:59.999Z']});
  expect(body.byDay).toEqual([{date:'2026-10-16',orders:1,revenue:2000}]);
  expect(body.topAddons).toEqual([{id:'bacon',quantity:2}]);expect(body.topProducts).toHaveLength(1);
 });
 it('retorna erro de período em vez de executar consulta inconsistente',async()=>{
  const result=await GET(new NextRequest('http://localhost/api/reports?start=2026-10-20&end=2026-10-16'));
  expect(result.status).toBe(400);expect(state.calls).toHaveLength(0);
 });
 it('exporta o número diário e mantém o download no formato CSV',async()=>{
  const result=await GET(new NextRequest('http://localhost/api/reports?start=2026-10-16&end=2026-10-16&format=csv'));
  expect(result.headers.get('content-type')).toContain('text/csv');
  const text=await result.text();expect(text).toContain('"2";"2026-10-17T02:30:00Z"');expect(text).not.toContain('"10040"');
 });
});
