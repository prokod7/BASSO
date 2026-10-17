// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoActions } from '@/lib/demo-store';
const sound=vi.hoisted(()=>vi.fn(async()=>{}));
vi.mock('@/lib/order-notification-sound',()=>({playNewOrderSound:sound}));
import KdsPage from '@/app/painel/kds/page';
const makeOrder=(id:string,sector:'kitchen'|'bar')=>({id,number:1,channel:'counter',status:'received',paymentStatus:'pending',customerName:id,customerPhone:'',total:1000,subtotal:1000,discount:0,deliveryFee:0,paymentMethod:'pix',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceIdempotencyKey:id,items:[{id:id+'-item',name:'Item teste',kind:sector==='bar'?'product':'pizza',sector,quantity:1,unitPrice:1000,productionStatus:'queued'}]} as any);
beforeEach(()=>{Object.assign(globalThis,{React});vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','true');demoActions.reset();demoActions.replaceSnapshot({orders:[makeOrder('existing-kitchen','kitchen'),makeOrder('existing-bar','bar')]});sound.mockClear();});
afterEach(()=>{cleanup();vi.unstubAllEnvs();});
describe('avisos da cozinha',()=>{
 it('não toca ao carregar, buscar ou trocar de setor, mas avisa pedido novo do setor',()=>{
  render(React.createElement(KdsPage));expect(sound).not.toHaveBeenCalled();
  fireEvent.change(screen.getByPlaceholderText('Buscar pedido, mesa ou código'),{target:{value:'sem resultado'}});
  fireEvent.change(screen.getByPlaceholderText('Buscar pedido, mesa ou código'),{target:{value:''}});
  fireEvent.click(screen.getByRole('button',{name:'Bar'}));fireEvent.click(screen.getByRole('button',{name:'Cozinha'}));expect(sound).not.toHaveBeenCalled();
  act(()=>demoActions.replaceSnapshot({orders:[makeOrder('existing-kitchen','kitchen'),makeOrder('new-kitchen','kitchen')]}));expect(sound).toHaveBeenCalledOnce();
 });
 it('respeita som desativado e permite testar ao reativar',()=>{
  render(React.createElement(KdsPage));fireEvent.click(screen.getByRole('button',{name:'Som ativo'}));
  act(()=>demoActions.replaceSnapshot({orders:[makeOrder('new-kitchen','kitchen')]}));expect(sound).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Som desativado'}));expect(sound).toHaveBeenCalledOnce();
 });
});
