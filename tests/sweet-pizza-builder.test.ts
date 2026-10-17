// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartProvider } from '@/context/CartContext';
import { EnhancedPizzaBuilder } from '@/components/public/EnhancedPizzaBuilder';
import { findFlavor } from '@/lib/catalog';
import { pizzaTotal } from '@/lib/pricing';
import type { PizzaSelection } from '@/types';
vi.mock('next/image',()=>({default:({fill,priority,...props}:any)=>React.createElement('img',props)}));
beforeEach(()=>{Object.assign(globalThis,{React});localStorage.clear();});
afterEach(()=>cleanup());
const base=(id:string):PizzaSelection=>({size:'grande',mass:'traditional',flavorA:id,removedA:[],removedB:[],addons:{},notes:''});
function mount(id='brigadeiro',initialSelection?:PizzaSelection){const add=vi.fn();const close=vi.fn();render(React.createElement(CartProvider,null,React.createElement(EnhancedPizzaBuilder,{flavor:findFlavor(id),open:true,onAdd:add,onClose:close,initialSelection})));return{add,close};}
function finish(edit=false){fireEvent.click(screen.getByRole('button',{name:'Continuar'}));fireEvent.click(screen.getByRole('button',{name:'Revisar pedido'}));fireEvent.click(screen.getByRole('button',{name:edit?/Salvar alterações/:/Adicionar à sacola/}));}
describe('base zero visível durante a montagem da pizza doce',()=>{
 it('mostra a opção antes de adicionar e mantém preço/seleção até a sacola',()=>{
  const {add,close}=mount();const option=screen.getByRole('checkbox',{name:/Adicionar Creme de Avelã Zero/});expect((option as HTMLInputElement).checked).toBe(false);
  fireEvent.click(option);finish();expect(add).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
  expect(add.mock.calls[0][0]).toMatchObject({unitPrice:pizzaTotal(base('brigadeiro'))+2500,selection:{sweetBase:'hazelnut-zero',cutPreference:'uncut'}});
  expect(add.mock.calls[0][0].name).toContain('Base Avelã Zero');
 });
 it('mantém base inclusa sem acréscimo quando não selecionada',()=>{const {add}=mount();finish();expect(add.mock.calls[0][0].unitPrice).toBe(pizzaTotal(base('brigadeiro')));expect(add.mock.calls[0][0].selection.sweetBase).toBe('standard');});
 it('preserva a base e o corte na edição e permite retirar o acréscimo',()=>{
  const {add}=mount('brigadeiro',{...base('brigadeiro'),sweetBase:'hazelnut-zero',cutPreference:'cut'});
  const option=screen.getByRole('checkbox',{name:/Adicionar Creme de Avelã Zero/});expect((option as HTMLInputElement).checked).toBe(true);
  fireEvent.click(option);finish(true);expect(add.mock.calls[0][0]).toMatchObject({unitPrice:pizzaTotal(base('brigadeiro')),selection:{sweetBase:'standard',cutPreference:'cut'}});
 });
 it('não oferece nem cobra a base doce em uma pizza salgada',()=>{
  const {add}=mount('mozzarella',{...base('mozzarella'),sweetBase:'hazelnut-zero',cutPreference:'cut'});expect(screen.queryByRole('checkbox',{name:/Creme de Avelã Zero/})).toBeNull();finish(true);expect(add.mock.calls[0][0].selection.sweetBase).toBeUndefined();expect(add.mock.calls[0][0].unitPrice).toBe(pizzaTotal(base('mozzarella')));
 });
});
