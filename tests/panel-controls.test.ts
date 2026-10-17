// @vitest-environment jsdom
/// <reference types="vite/client" />
import React from 'react';
import { CartProvider } from '@/context/CartContext';
import { demoActions } from '@/lib/demo-store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => '/painel', useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));
vi.mock('next/image', () => ({ default: ({ fill, priority, ...props }: any) => React.createElement('img', props) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: any) => React.createElement('a', props, children) }));
vi.mock('next/dynamic', () => ({ default: () => () => React.createElement('div', { 'data-testid': 'external-map' }) }));
vi.mock('@/components/internal/OperationalHydrator', () => ({ OperationalHydrator: () => null }));
const pages = import.meta.glob('../src/app/painel/**/page.tsx');
const fetchMock = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { React });
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
  localStorage.clear();
  demoActions.reset();
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ error: 'BACKEND_INDISPONIVEL_TESTE' }), { status: 503, headers: { 'content-type':'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window, 'print').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  vi.spyOn(window, 'open').mockReturnValue(null);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('painel: renderização e atualização com backend indisponível', () => {
 it.each(Object.entries(pages))('%s', async (_, load) => {
  const Page = (await load() as any).default;
  await act(async () => { render(React.createElement(CartProvider, null, React.createElement(Page))); });
  expect(document.body.textContent?.trim().length).toBeGreaterThan(10);
  const refresh = screen.queryAllByRole('button', { name: /Atualizar/i }).find(button => !button.hasAttribute('disabled'));
  if (refresh) await act(async () => { fireEvent.click(refresh); });
  expect(document.body.textContent).not.toContain('Application error');
 });
});

describe('ações de abrir e configurar telas, sem escrita externa', () => {
 it.each(Object.entries(pages))('%s', async (_, load) => {
  const Page=(await load() as any).default;
  const mount=async()=>{await act(async()=>{render(React.createElement(CartProvider,null,React.createElement(Page)));});};
  await mount();
  const names=[...new Set(screen.queryAllByRole('button').filter(b=>!b.hasAttribute('disabled')).map(b=>b.textContent?.trim()||'').filter(name=>/^(Novo|Nova |Criar |Adicionar |Editar|Detalhes|Configurar|Prévia|Selecionar tudo|Limpar seleção|Lista$|Kanban$)/i.test(name)))];
  for(const name of names.slice(0,5)) {
    cleanup();await mount();
    const button=screen.queryAllByRole('button').find(b=>b.textContent?.trim()===name&&!b.hasAttribute('disabled'));
    if(button)await act(async()=>{fireEvent.click(button);});
    expect(document.body.textContent).not.toContain('Application error');
  }
 });
});

describe('regressões de ações operacionais', () => {
 it('mantém a confirmação de conclusão do inventário depois da atualização',async()=>{
  const Page=(await import('../src/app/painel/inventario/page')).default;
  let completed=false;
  fetchMock.mockImplementation(async(_:string,init?:RequestInit)=>{
   if(init?.method==='PUT'){completed=true;return Response.json({adjustments:1});}
   return Response.json({count:completed?null:{id:'count',status:'open',startedAt:'2026-10-17T00:00:00Z',items:[{id:'item',name:'Água',systemQuantity:2,countedQuantity:3,difference:1,unit:'unidade'}]}});
  });
  vi.mocked(window.confirm).mockReturnValue(true);
  await act(async()=>{render(React.createElement(Page));});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Concluir e aplicar diferenças'}));});
  expect(screen.getByText('Inventário concluído. 1 ajuste(s) aplicado(s).')).toBeTruthy();
  expect(screen.getByText('Nenhum inventário aberto')).toBeTruthy();
 });
 it('preserva a confirmação ao salvar configurações atuais',async()=>{
  const Page=(await import('../src/app/painel/sistema/page')).default;
  fetchMock.mockImplementation(async(url:string)=>Response.json(url.includes('/about')?{appName:'Basso',version:'9',clientName:'Basso',environment:'test'}:url.includes('feature-flags')?{flags:[]}:{snapshots:[]}));
  await act(async()=>{render(React.createElement(Page));});
  fireEvent.change(screen.getByPlaceholderText('Ex.: Antes do feriado'),{target:{value:'Snapshot teste'}});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Salvar configuração atual'}));});
  expect(screen.getByText('Snapshot das configurações criado.')).toBeTruthy();
 });
 it('não mostra números de demonstração nem libera exportação quando o relatório falha em produção',async()=>{
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','false');
  const Page=(await import('../src/app/painel/relatorios/page')).default;
  await act(async()=>{render(React.createElement(Page));});
  expect(screen.queryByText('Faturamento pago')).toBeNull();
  expect(screen.getByRole('button',{name:'Exportar Excel/CSV'}).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText('BACKEND_INDISPONIVEL_TESTE')).toBeTruthy();
 });
 it('mostra falha de exportação CSV na própria tela',async()=>{
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','false');
  const Page=(await import('../src/app/painel/relatorios/page')).default;
  fetchMock.mockImplementation(async(url:string)=>url.includes('format=csv')?Response.json({error:'Exportação indisponível'},{status:503}):Response.json({period:{},summary:{orders:0,revenue:0,averageTicket:0,cancelledOrders:0,averageRating:null,financialIncome:0,financialExpense:0,estimatedResult:0,discounts:0,deliveryFees:0},byChannel:{},byPayment:{},topProducts:[]}));
  await act(async()=>{render(React.createElement(Page));});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Exportar Excel/CSV'}));});
  expect(screen.getByText('Exportação indisponível')).toBeTruthy();
 });
});


describe('telas em modo de produção: falhas de API controladas',()=>{
 beforeEach(()=>{vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','false');demoActions.reset();});
 it.each(Object.entries(pages))('%s',async(_,load)=>{
  const Page=(await load() as any).default;
  await act(async()=>{render(React.createElement(CartProvider,null,React.createElement(Page)));});
  expect(document.body.textContent?.trim().length).toBeGreaterThan(10);
  expect(document.body.textContent).not.toContain('Application error');
 });
});

const publicPages=Object.entries(import.meta.glob('../src/app/**/page.tsx')).filter(([path])=>!path.includes('/painel/'));
describe('páginas do cliente, login e operação mobile',()=>{
 it.each(publicPages)('%s',async(_,load)=>{
  const Page=(await load() as any).default;
  const params=Promise.resolve({id:'audit-order',token:'audit-token',number:'1'});
  await act(async()=>{render(React.createElement(CartProvider,null,React.createElement(React.Suspense,{fallback:React.createElement('p',null,'Carregando')},React.createElement(Page,{params}))));});
  expect(document.body.textContent?.trim().length).toBeGreaterThan(5);
 });
 it('atualiza quantidade, duplica, remove e mantém link de checkout no carrinho',async()=>{
  localStorage.setItem('lfb-cart-v31',JSON.stringify([{id:'test-water',kind:'product',name:'Água de teste',quantity:1,unitPrice:500}]));
  const {CartDrawer} = await import('@/components/public/CartDrawer');
  const {useCart}=await import('@/context/CartContext');
  function Opener(){const cart=useCart();return React.createElement('button',{onClick:()=>cart.setOpen(true)},'Abrir carrinho de teste');}
  await act(async()=>{render(React.createElement(CartProvider,null,React.createElement(Opener),React.createElement(CartDrawer)));});
  fireEvent.click(screen.getByRole('button',{name:'Abrir carrinho de teste'}));
  fireEvent.click(screen.getByRole('button',{name:'Aumentar quantidade de Água de teste'}));
  expect(screen.getByRole('link',{name:/Continuar para o checkout/}).textContent).toContain('10,00');
  fireEvent.click(screen.getByRole('button',{name:'Duplicar Água de teste'}));
  expect(screen.getAllByRole('button',{name:'Remover Água de teste'})).toHaveLength(2);
  fireEvent.click(screen.getAllByRole('button',{name:'Remover Água de teste'})[0]);
  fireEvent.click(screen.getByRole('button',{name:'Remover Água de teste'}));
  expect(screen.getByText('Seu carrinho está vazio')).toBeTruthy();
 });
});
