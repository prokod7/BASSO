import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>mock.db}));
import { GET } from '@/app/api/public-orders/[id]/events/route';
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it('não abre canal sem o token privado ou com token inválido',async()=>{
 const channel=vi.fn();mock.db={rpc:vi.fn().mockResolvedValue({data:null,error:null}),channel};
 expect((await GET(new NextRequest('https://basso.test/api/public-orders/order-1/events'),{params:Promise.resolve({id:'order-1'})})).status).toBe(401);
 expect((await GET(new NextRequest('https://basso.test/api/public-orders/order-1/events?token=invalid'),{params:Promise.resolve({id:'order-1'})})).status).toBe(404);
 expect(channel).not.toHaveBeenCalled();
});
it('envia somente a projeção autorizada e atualiza por evento, encerrando ao cancelar',async()=>{
 vi.useFakeTimers();let change:()=>void=()=>{};
 const channel={on:vi.fn().mockImplementation((_type,_filter,callback)=>{change=callback;return channel}),subscribe:vi.fn()};
 const initial={id:'order-1',status:'received',total:4800};
 const rpc=vi.fn().mockResolvedValue({data:initial,error:null});
 mock.db={rpc,channel:vi.fn().mockReturnValue(channel),removeChannel:vi.fn().mockResolvedValue('ok')};
 const response=await GET(new NextRequest('https://basso.test/api/public-orders/order-1/events?token=private-token'),{params:Promise.resolve({id:'order-1'})});
 expect(response.headers.get('content-type')).toBe('text/event-stream');
 const reader=response.body!.getReader();const decoder=new TextDecoder();
 expect(decoder.decode((await reader.read()).value)).toContain('"status":"received"');
 rpc.mockResolvedValue({data:{...initial,status:'preparing'},error:null});change();
 expect(decoder.decode((await reader.read()).value)).toContain('"status":"preparing"');
 expect(rpc).toHaveBeenLastCalledWith('get_public_order',{p_order_id:'order-1',p_token:'private-token'});
 await reader.cancel();expect(mock.db.removeChannel).toHaveBeenCalledWith(channel);
 expect(vi.getTimerCount()).toBe(0);
});
