import {describe,it,expect,vi} from 'vitest';
import {reportPeriod,saoPauloDate} from '@/lib/report-period';
import {tabPrebillHtml,printTabPrebill} from '@/lib/tab-prebill';
import type {DemoTab} from '@/types';
const tab:DemoTab={id:'tab',name:'Ana <script>alert(1)</script>',items:[{id:'water',kind:'product',name:'Água',quantity:2,unitPrice:500}],totalCents:1000,paidCents:300,serviceChargeRate:10,serviceChargeApplied:true,waiter:'Equipe',status:'partial'};
describe('período comercial e pré-conta',()=>{
 it('inclui o final da noite no dia de São Paulo',()=>{
  expect(saoPauloDate('2026-10-17T02:59:59Z')).toBe('2026-10-16');
  expect(reportPeriod('2026-10-16','2026-10-16')).toEqual({start:'2026-10-16',end:'2026-10-16',startIso:'2026-10-16T03:00:00.000Z',endIso:'2026-10-17T02:59:59.999Z'});
 });
 it('rejeita datas inexistentes e intervalo invertido',()=>{
  expect(()=>reportPeriod('2026-02-31','2026-03-01')).toThrow('período válido');
  expect(()=>reportPeriod('2026-10-17','2026-10-16')).toThrow('período válido');
 });
 it('gera conta separada do painel com serviço, pagamentos parciais e escape de texto',()=>{
  const html=tabPrebillHtml(2,tab);
  expect(html).toContain('PRÉ-CONTA • Mesa 2');expect(html).toContain('11,00');expect(html).toContain('8,00');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');expect(html).not.toContain('Ana <script>');
  expect(tabPrebillHtml(2,tab,false)).toContain('7,00');
 });
 it('avisa quando popup de pré-conta é bloqueado',()=>{
  vi.stubGlobal('window',{open:vi.fn(()=>null)});
  expect(()=>printTabPrebill(2,tab)).toThrow('bloqueou');vi.unstubAllGlobals();
 });
 it('escreve apenas a pré-conta na janela de impressão',()=>{
  const document={open:vi.fn(),write:vi.fn(),close:vi.fn()};vi.stubGlobal('window',{open:vi.fn(()=>({document}))});
  printTabPrebill(2,tab);expect(document.write).toHaveBeenCalledWith(expect.stringContaining('PRÉ-CONTA'));expect(document.close).toHaveBeenCalled();vi.unstubAllGlobals();
 });
});
