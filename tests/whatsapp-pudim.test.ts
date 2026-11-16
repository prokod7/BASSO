import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendMedia } from '@/lib/whatsapp/provider';
import { PUDDING_OFFER, PUDDING_IMAGE } from '@/lib/whatsapp/turn';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('oferta de pudim', () => {
  it('envia a foto com a legenda na mesma mensagem', async () => {
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID','test'); vi.stubEnv('DUALHOOK_API_KEY','test');
    const fetcher = vi.fn().mockResolvedValue({ok:true,json:async()=>({messages:[{id:'message-test'}]})});
    vi.stubGlobal('fetch',fetcher);
    expect(await sendMedia('5511999999999',PUDDING_IMAGE,'job-test',PUDDING_OFFER)).toBe('message-test');
    const payload=JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.type).toBe('image');
    expect(payload.image).toEqual({link:PUDDING_IMAGE,caption:PUDDING_OFFER});
    expect(payload.image.caption).toContain('Limão Siciliano e Maracujá - R$15,00 Unidade.💛');
  });
});
