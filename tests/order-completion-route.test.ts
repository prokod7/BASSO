import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { assertOrderTransition, requiresTransitionReason, validTransitions } from '@/lib/operational-state';
import type { OperationalRole } from '@/lib/authz';
import type { OrderChannel, OrderStatus } from '@/types';
const state=vi.hoisted(()=>({role:'manager',active:true,user:true,permissions:{} as Record<string,boolean>,order:{} as any,rpc:vi.fn(),external:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user?{id:'operator'}:null}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{display_name:'Equipe',role:state.role,active:state.active,permissions:state.permissions,must_change_password:false}})})})})})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>{const q:any={select:()=>q,eq:()=>q,is:()=>q,single:async()=>({data:state.order,error:null}),insert:async()=>({error:null})};return q;},rpc:state.rpc})}));
vi.mock('@/lib/integrations/ifood',()=>({IfoodAdapter:class {updateStatus=state.external;cancelOrder=state.external;}}));
import { PATCH } from '@/app/api/orders/[id]/status/route';
const roles:OperationalRole[]=['manager','counter','waiter','kitchen','bar','driver','finance','viewer'];
const activeStatuses:OrderStatus[]=['received','confirmed','preparing','ready','out_for_delivery'];
const channels:OrderChannel[]=['own_delivery','pickup','counter','dine_in','ifood','99food','table_qr'];
const run=(status='completed',version=3)=>PATCH(new NextRequest('http://localhost/api/orders/order/status',{method:'PATCH',body:JSON.stringify({status,expectedVersion:version})}),{params:Promise.resolve({id:'order'})});
beforeEach(()=>{vi.stubEnv('DEMO_MODE','false');state.role='manager';state.active=true;state.user=true;state.permissions={};state.order={id:'order',status:'received',channel:'own_delivery',payment_status:'pending',version:3};state.rpc.mockReset().mockImplementation(async()=>{state.order={...state.order,status:'completed',version:4};return {error:null};});state.external.mockReset();});
describe('conclusão direta para todos os perfis ativos',()=>{
 it.each(roles)('%s conclui de qualquer etapa ativa/canal sem motivo',role=>{
  for(const current of activeStatuses) for(const channel of channels){
   expect(validTransitions(current,channel,role)).toContain('completed');
   expect(()=>assertOrderTransition({current,target:'completed',channel,role})).not.toThrow();
   expect(requiresTransitionReason(current,'completed')).toBe(false);
  }
 });
 it.each(roles)('API autentica %s e registra seu ID mesmo sem orders.edit',async role=>{
  state.role=role;state.permissions={'orders.edit':false};
  expect((await run()).status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith('change_order_status_controlled',expect.objectContaining({p_status:'completed',p_reason:null,p_actor_id:'operator',p_expected_version:3}));
 });
 it.each(['inactive','anonymous'])('recusa %s sem executar mutação',async kind=>{
  if(kind==='inactive')state.active=false;else state.user=false;
  expect((await run()).status).not.toBe(200);expect(state.rpc).not.toHaveBeenCalled();
 });
 it('mantém controle de versão e retorna conflito',async()=>{expect((await run('completed',2)).status).toBe(409);expect(state.rpc).not.toHaveBeenCalled();});
 it('não concede outras alterações ao visualizador',async()=>{state.role='viewer';expect((await run('confirmed')).status).not.toBe(200);expect(state.rpc).not.toHaveBeenCalled();});
 it('mantém bloqueio de edição explicitamente revogada nas outras etapas',async()=>{state.role='counter';state.permissions={'orders.edit':false};expect((await run('confirmed')).status).not.toBe(200);expect(state.rpc).not.toHaveBeenCalled();});
 it('não conclui pedido cancelado sem reabertura',async()=>{state.order.status='cancelled';expect((await run()).status).not.toBe(200);expect(state.rpc).not.toHaveBeenCalled();});
 it('conclusão operacional do iFood não depende da disponibilidade da integração',async()=>{state.order.channel='ifood';state.order.external_id='external';expect((await run()).status).toBe(200);expect(state.external).not.toHaveBeenCalled();});
 it('cancelamento e retorno de etapa continuam exigindo motivo',()=>{expect(requiresTransitionReason('received','cancelled')).toBe(true);expect(requiresTransitionReason('preparing','confirmed')).toBe(true);});
});
