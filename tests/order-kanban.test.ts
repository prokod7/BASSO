// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderKanban } from '@/components/internal/OrderKanban';
import { demoActions, useDemoState } from '@/lib/demo-store';
import type { Order } from '@/types';
const initial:Order={id:'kanban-test',number:77,channel:'counter',status:'received',paymentStatus:'pending',customerName:'Cliente teste',customerPhone:'',items:[],total:1000,subtotal:1000,discount:0,deliveryFee:0,paymentMethod:'pix',createdAt:'2026-10-17T10:00:00Z',updatedAt:'2026-10-17T10:00:00Z',version:1,sourceIdempotencyKey:'test'};
const fetchMock=vi.fn(),refresh=vi.fn(),open=vi.fn();
function Harness(){const orders=useDemoState(s=>s.orders);return React.createElement(OrderKanban,{orders,onOpen:open});}
beforeEach(()=>{
 Object.assign(globalThis,{React});vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','true');demoActions.reset();vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','false');demoActions.replaceSnapshot({orders:[{...initial}],tables:[]});
 vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();open.mockReset();refresh.mockReset();window.addEventListener('lfb:refresh-operation',refresh);
 vi.spyOn(window,'prompt').mockReturnValue(null);
});
afterEach(()=>{cleanup();window.removeEventListener('lfb:refresh-operation',refresh);vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('Kanban operacional',()=>{
 it('conclui com um toque, mostra salvando, mantém pagamento e move após confirmação',async()=>{
  let finish!:(response:Response)=>void;fetchMock.mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve;}));render(React.createElement(Harness));
  fireEvent.click(screen.getByRole('button',{name:'Concluir pedido 77'}));
  expect(screen.getByText('Salvando...')).toBeTruthy();expect((screen.getByRole('button',{name:'Concluir pedido 77'}) as HTMLButtonElement).disabled).toBe(true);expect(window.prompt).not.toHaveBeenCalled();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({status:'completed',expectedVersion:1});
  await act(async()=>finish(Response.json({status:'completed',version:2})));
  expect(within(screen.getByRole('region',{name:'Concluídos'})).getByText('Cliente teste')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('O pagamento não foi alterado');expect(refresh).toHaveBeenCalledOnce();
  let current:Order|undefined;function Inspect(){current=useDemoState(s=>s.orders[0]);return null;}render(React.createElement(Inspect));expect(current?.paymentStatus).toBe('pending');
 });
 it('mostra conflito e solicita os dados atuais sem aplicar a alteração rejeitada',async()=>{
  fetchMock.mockResolvedValue(Response.json({error:'Pedido alterado em outro dispositivo'},{status:409}));render(React.createElement(Harness));
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Concluir pedido 77'})));
  expect(screen.getByRole('alert').textContent).toContain('outro dispositivo');expect(refresh).toHaveBeenCalledOnce();
  expect(within(screen.getByRole('region',{name:'Recebidos'})).getByText('Cliente teste')).toBeTruthy();
  act(()=>demoActions.replaceSnapshot({orders:[{...initial,status:'confirmed',version:2}]}));
  expect(within(screen.getByRole('region',{name:'Confirmados'})).getByText('Cliente teste')).toBeTruthy();
 });
 it('oferece seletor acessível sem depender de arrastar e preserva cancelamento motivado',async()=>{
  fetchMock.mockResolvedValue(Response.json({status:'confirmed',version:2}));render(React.createElement(Harness));
  await act(async()=>fireEvent.change(screen.getByRole('combobox',{name:'Mover pedido 77 para'}),{target:{value:'confirmed'}}));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({status:'confirmed',expectedVersion:1});
  expect(within(screen.getByRole('region',{name:'Confirmados'})).getByText('Cliente teste')).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox',{name:'Mover pedido 77 para'}),{target:{value:'cancelled'}});
  expect(window.prompt).toHaveBeenCalledOnce();expect(fetchMock).toHaveBeenCalledOnce();
 });
 it('arrasta somente pela alça e destaca a coluna de destino',async()=>{
  fetchMock.mockResolvedValue(Response.json({status:'confirmed',version:2}));render(React.createElement(Harness));
  const handle=screen.getByRole('button',{name:'Arrastar pedido 77'});expect(handle.getAttribute('draggable')).toBe('true');
  const card=screen.getByRole('button',{name:/Cliente teste/});expect(card.getAttribute('draggable')).toBeNull();
  const transfer={setData:vi.fn(),effectAllowed:'',dropEffect:''};fireEvent.dragStart(handle,{dataTransfer:transfer});
  const column=screen.getByRole('region',{name:'Confirmados'});fireEvent.dragOver(column,{dataTransfer:transfer});expect(column.className).toContain('ring-2');
  await act(async()=>fireEvent.drop(column,{dataTransfer:transfer}));expect(fetchMock).toHaveBeenCalledOnce();expect(open).not.toHaveBeenCalled();
 });
 it('ignora snapshot e resposta de gravação mais antigos que a versão confirmada',()=>{
  render(React.createElement(Harness));act(()=>demoActions.applyConfirmedOrderStatus(initial.id,'completed',3));
  act(()=>demoActions.replaceSnapshot({orders:[{...initial,status:'preparing',version:2}]}));
  act(()=>demoActions.applyConfirmedOrderStatus(initial.id,'confirmed',2));
  expect(within(screen.getByRole('region',{name:'Concluídos'})).getByText('Cliente teste')).toBeTruthy();
 });
 it('modo demonstração também não dá baixa automática no pagamento',()=>{
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','true');render(React.createElement(Harness));fireEvent.click(screen.getByRole('button',{name:'Concluir pedido 77'}));
  let current:Order|undefined;function Inspect(){current=useDemoState(s=>s.orders[0]);return null;}render(React.createElement(Inspect));expect(current?.paymentStatus).toBe('pending');expect(fetchMock).not.toHaveBeenCalled();
 });
});
