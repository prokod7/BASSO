import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ job: null as any, order: null as any, updated: {id:'job'} as any, writes: [] as any[], filters: [] as any[] }));
vi.mock('@/lib/authz', () => ({ requireOperationalRole: vi.fn(async () => ({role:'manager'})) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  let write = false;
  const query: any = { select: () => query, eq: (...args: any[]) => { if(write) state.filters.push(args); return query; },
    update: (value: any) => { write = true; state.writes.push(value); return query; },
    maybeSingle: async () => ({data: write ? state.updated : table === 'orders' ? state.order : state.job, error: null}) };
  return query;
} }) }));
import { POST } from '@/app/api/print/retry/route';
const run = () => POST(new NextRequest('http://localhost/api/print/retry', {method:'POST', body:JSON.stringify({jobId:'job'})}));
beforeEach(() => { state.job = {id:'job', status:'cancelled', attempts:8, order_id:'order'}; state.order = {id:'order', status:'completed', deleted_at:null}; state.updated = {id:'job'}; state.writes=[]; state.filters=[]; });
describe('reprocessamento de impressão', () => {
 it('recupera trabalho esgotado e usa estado anterior como proteção de concorrência', async () => {
  expect((await run()).status).toBe(200);
  expect(state.writes[0]).toMatchObject({status:'queued',attempts:0,claimed_at:null,processed_at:null});
  expect(state.filters).toContainEqual(['attempts',8]);expect(state.filters).toContainEqual(['status','cancelled']);
 });
 it.each(['queued','processing'])('não duplica trabalho %s', async status => { state.job.status=status; expect((await run()).status).toBe(409); expect(state.writes).toHaveLength(0); });
 it('não confirma sucesso para trabalho inexistente', async () => { state.job=null; expect((await run()).status).toBe(404); });
 it.each([{status:'cancelled'}, {deleted_at:'2026-10-17'}])('não reativa pedido cancelado/arquivado', async changes => { Object.assign(state.order,changes); expect((await run()).status).toBe(409);expect(state.writes).toHaveLength(0); });
 it('informa conflito quando outro operador alterou a fila', async () => { state.updated=null; expect((await run()).status).toBe(409); });
});
