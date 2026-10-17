import { describe, expect, it } from 'vitest';
import { isOrderDelayed, pendingPaymentTotal, tabBalance } from '@/lib/operational-totals';
import type { DemoTab, Order } from '@/types';
const order = (changes: Partial<Order> = {}) => ({ id: 'one', status: 'preparing', paymentStatus: 'pending', total: 10000, createdAt: '2026-10-17T12:00:00Z', ...changes } as Order);
const tab = (changes: Partial<DemoTab> = {}) => ({ id: 'tab', status: 'partial', totalCents: 10000, paidCents: 10000, ...changes } as DemoTab);
describe('saldos e atraso operacionais', () => {
  it('permite receber somente a taxa de serviço restante', () => {
    expect(tabBalance(tab())).toBe(1000);
    expect(tabBalance(tab({ serviceChargeApplied: false }))).toBe(0);
    expect(tabBalance(tab({ serviceChargeRate: 0 }))).toBe(0);
  });
  it('soma saldos parciais e conta a comanda uma única vez, incluindo serviço', () => {
    const orders = [order({ paidAmount: 6000, balanceDue: 4000, paymentStatus: 'partial' }), order({ status: 'cancelled' }), order({ paymentStatus: 'paid' }), order({ tabId: 'tab' }), order({ tabId: 'tab' })];
    expect(pendingPaymentTotal(orders, [tab()])).toBe(5000);
  });
  it('usa o prazo estimado ou 60 minutos e exclui pedidos encerrados', () => {
    const now = Date.parse('2026-10-17T13:01:00Z');
    expect(isOrderDelayed(order(), now)).toBe(true);
    expect(isOrderDelayed(order({ estimatedReadyAt: '2026-10-17T13:30:00Z' }), now)).toBe(false);
    expect(isOrderDelayed(order({ createdAt: '2026-10-17T13:00:00Z', estimatedReadyAt: '2026-10-17T13:00:30Z' }), now)).toBe(true);
    expect(isOrderDelayed(order({ status: 'completed' }), now)).toBe(false);
  });
});
