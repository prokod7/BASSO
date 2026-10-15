import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({client:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:state.client}));
import { config, middleware } from '@/middleware';
function session(profile:any,user:any={id:'user'}){
 state.client.mockReturnValue({auth:{getUser:async()=>({data:{user}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile,error:null})})})})});
}
beforeEach(()=>{vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://example.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','public-test');});
afterEach(()=>vi.unstubAllEnvs());
describe('proteção efetiva de páginas',()=>{
 it.each(['/painel','/painel/financeiro','/garcom','/trocar-senha'])('inclui %s no matcher compilado',url=>{
  expect(unstable_doesMiddlewareMatch({config,nextConfig:{},url:'https://basso.test'+url})).toBe(true);
 });
 it.each(['/api/print/heartbeat','/api/print/claim','/api/print/complete','/api/integrations/ifood/webhook','/api/integrations/99food/webhook','/api/integrations/fiscal/orders','/api/orders'])('preserva autenticação própria de %s',url=>{
  expect(unstable_doesMiddlewareMatch({config,nextConfig:{},url:'https://basso.test'+url})).toBe(false);
 });
 it('redireciona usuário sem sessão antes de renderizar o painel',async()=>{
  session(null,null);const r=await middleware(new NextRequest('https://basso.test/painel'));expect(r.headers.get('location')).toContain('/login?next=');
 });
 it('barra perfil desativado',async()=>{
  session({active:false});const r=await middleware(new NextRequest('https://basso.test/painel'));expect(r.headers.get('location')).toContain('/login?error=access');
 });
 it('exige troca de senha na navegação sem impedir a tela de troca',async()=>{
  session({active:true,must_change_password:true});expect((await middleware(new NextRequest('https://basso.test/painel'))).headers.get('location')).toContain('/trocar-senha');
  expect((await middleware(new NextRequest('https://basso.test/trocar-senha'))).status).toBe(200);
 });
 it('não libera produção mesmo com DEMO_MODE=true',async()=>{
  vi.stubEnv('DEMO_MODE','true');session(null,null);expect((await middleware(new NextRequest('https://basso.test/painel'))).status).toBe(307);
 });
});
