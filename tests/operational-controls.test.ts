// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ orders: [] as any[], tables: [] as any[], financialEntries: [], params: 'filter=delayed' }));
vi.mock('@/lib/demo-store', () => ({ useDemoState: (select: any) => select(state), demoActions: {} }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(state.params), useRouter: () => ({push:vi.fn()}) }));
vi.mock('@/components/internal/OrderDetailPanel', () => ({ OrderDetailPanel: () => null }));
vi.mock('@/components/internal/OrderCard', () => ({ OrderCard: ({order}: any) => React.createElement('div', null, order.customerName) }));
import OrdersPage from '@/app/painel/pedidos/page';
import SalaoPage from '@/app/painel/salao/page';
import PrintPage from '@/app/painel/impressao/page';
import ClientesPage from '@/app/painel/clientes/page';
import ReportsPage from '@/app/painel/relatorios/page';
const fetchMock = vi.fn();
beforeEach(() => {
 Object.assign(globalThis, {React}); vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','false'); vi.stubGlobal('fetch',fetchMock);
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 localStorage.clear(); state.orders=[];state.tables=[];state.params='filter=delayed';
 fetchMock.mockReset().mockResolvedValue(Response.json({}));
});
afterEach(() => {cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('controles operacionais com dados simulados, sem login', () => {
 it('aplica o atalho de atrasados, permite limpar e exporta apenas o filtro atual', async () => {
  const make=(name:string,minutes:number,extra={})=>({id:name,number:1,customerName:name,customerPhone:'',channel:'pickup',status:'preparing',paymentStatus:'pending',total:10000,items:[],createdAt:new Date(Date.now()-minutes*60000).toISOString(),...extra});
  state.orders=[make('ATRASADO',70),make('URGENTE_NO_PRAZO',5,{priority:'urgent'}),make('CONCLUIDO',80,{status:'completed'})];
  let blob: Blob | undefined;
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn((b:Blob)=>{blob=b;return 'blob:orders';}),revokeObjectURL:vi.fn()}));
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  await act(async()=>{render(React.createElement(OrdersPage));});
  expect(screen.getByText('ATRASADO')).toBeTruthy();expect(screen.queryByText('URGENTE_NO_PRAZO')).toBeNull();
  expect((screen.getByRole('checkbox',{name:'Somente pedidos atrasados'}) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Exportar'}));expect(click).toHaveBeenCalledOnce();
  const csv=await new Promise<string>((resolve)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.readAsText(blob!);});
  expect(csv).toContain('ATRASADO');expect(csv).not.toContain('URGENTE_NO_PRAZO');expect(csv).not.toContain('CONCLUIDO');
  fireEvent.click(screen.getByRole('button',{name:'Limpar filtros'}));expect(screen.getByText('URGENTE_NO_PRAZO')).toBeTruthy();
 });
 it('recebe os R$ 10 restantes de serviço e oferece apenas métodos aceitos pelo servidor', async () => {
  state.tables=[{number:1,capacity:4,status:'partial',tabs:[{id:'tab',name:'Comanda teste',status:'partial',items:[],totalCents:10000,paidCents:10000,serviceChargeApplied:true,serviceChargeRate:10}]}];
  await act(async()=>{render(React.createElement(SalaoPage));});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:/1 Parcialmente paga/}));});
  const receive=screen.getByRole('button',{name:'Receber'}) as HTMLButtonElement;
  expect(receive.disabled).toBe(false);expect(screen.queryByRole('option',{name:'Refeição'})).toBeNull();expect(screen.queryByRole('option',{name:'Alimentação'})).toBeNull();
  fireEvent.change(screen.getByPlaceholderText('Valor a receber'),{target:{value:'10'}});
  await act(async()=>{fireEvent.click(receive);});
  const call=fetchMock.mock.calls.find(([url])=>url==='/api/tabs/tab/payments');
  expect(call).toBeTruthy();expect(JSON.parse(call![1].body)).toMatchObject({amount:1000,method:'pix'});
 });
 it('mantém o aviso de teste offline depois da atualização da fila', async () => {
  const profile={key:'kitchen-main',name:'Cozinha teste',sector:'kitchen',widthMm:80,paperColumns:42,copies:1,active:true,template:{blockOrder:['items','header','notes'],highlightNotes:false,highlightRemovals:false}};
  fetchMock.mockImplementation(async(url:string)=>Response.json(url==='/api/print/profiles'?{profiles:[profile]}:url==='/api/print/jobs'?{jobs:[],bridgeConfigured:true,bridgeOnline:false}:{ok:true}));
  await act(async()=>{render(React.createElement(PrintPage));});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Testar'}));});
  expect(screen.getByText(/Teste entrou na fila, mas o Print Bridge está offline/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Editar'}));
  const preview=screen.getByLabelText('Prévia do comprovante');
  const blocks=()=>Array.from(preview.querySelectorAll('[data-receipt-block]')).map(el=>el.getAttribute('data-receipt-block'));
  expect(blocks()).toEqual(['items','header','notes']);
  expect(within(preview).getByText('SEM CEBOLA')).toBeTruthy();expect(within(preview).getByText('Entregar na portaria.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Mover header para cima'}));expect(blocks()).toEqual(['header','items','notes']);
 });
 it('não fabrica clientes quando o CRM falha e informa erro de exportação na tela', async () => {
  state.orders=[{id:'demo',channel:'pickup',customerName:'CLIENTE_LOCAL',customerPhone:'11999999999',status:'completed',paymentStatus:'paid',total:10000,createdAt:new Date().toISOString()}];
  fetchMock.mockImplementation(async()=>Response.json({error:'CRM indisponível'},{status:503}));
  await act(async()=>{render(React.createElement(ClientesPage));});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Atualizar'}));});
  expect(screen.queryByText('CLIENTE_LOCAL')).toBeNull();expect(screen.getByText('CRM indisponível')).toBeTruthy();
  expect((screen.getByRole('button',{name:'Exportar CSV'}) as HTMLButtonElement).disabled).toBe(true);
  fetchMock.mockImplementation(async(url:string)=>url.includes('format=csv')?Response.json({error:'Exportação indisponível'},{status:503}):Response.json({customers:[]}));
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Atualizar'}));});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Exportar CSV'}));});
  expect(screen.getByText('Exportação indisponível')).toBeTruthy();expect(screen.getByRole('heading',{name:'Clientes e CRM'})).toBeTruthy();
 });
 it('ignora resposta antiga do CRM depois da troca de segmento', async () => {
  let resolveOld!:(response:Response)=>void;
  fetchMock.mockImplementationOnce(()=>new Promise<Response>(resolve=>{resolveOld=resolve;}));
  await act(async()=>{render(React.createElement(ClientesPage));});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Atualizar'}));});
  fireEvent.change(screen.getByRole('combobox',{name:'Segmento de clientes'}),{target:{value:'active'}});
  fetchMock.mockImplementation(async()=>Response.json({customers:[{id:'new',name:'RESPOSTA_NOVA',phone:'',segment:'active',validOrders:2,totalSpent:10000,averageTicket:5000,consents:{}}]}));
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Atualizar'}));});
  await act(async()=>{resolveOld(Response.json({customers:[{id:'old',name:'RESPOSTA_ANTIGA',phone:'',segment:'active',consents:{}}]}));});
  expect(screen.getByText('RESPOSTA_NOVA')).toBeTruthy();expect(screen.queryByText('RESPOSTA_ANTIGA')).toBeNull();
 });
 it('baixa o CSV de relatórios com o período selecionado', async () => {
  const report={period:{},summary:{orders:0,paidOrders:0,cancelledOrders:0,revenue:0,discounts:0,deliveryFees:0,averageTicket:0,averageRating:null,financialIncome:0,financialExpense:0,estimatedResult:0},byChannel:{},byPayment:{},byDay:[],topProducts:[],topAddons:[]};
  fetchMock.mockImplementation(async(url:string)=>url.includes('format=csv')?new Response('"Pedido";"Total"\r\n"2";"1000"',{headers:{'Content-Type':'text/csv'}}):Response.json(report));
  const create=vi.fn(()=> 'blob:report');vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:vi.fn()}));
  let filename='';vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){filename=this.download;});
  await act(async()=>{render(React.createElement(ReportsPage));});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:/CSV/}));});
  const url=fetchMock.mock.calls.find(([url])=>url.includes('format=csv'))?.[0];expect(url).toBeTruthy();
  const params=new URLSearchParams(url.split('?')[1]);expect(filename).toBe(`relatorio-la-forneria-${params.get('start')}-${params.get('end')}.csv`);expect(create).toHaveBeenCalledOnce();
 });
});
