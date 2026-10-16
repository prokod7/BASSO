import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// O navegador recebe somente a projeção autorizada por get_public_order.
// A conexão administrativa Realtime e sua chave permanecem no servidor.
export async function GET(request: NextRequest, {params}: {params: Promise<{id:string}>}) {
  const {id}=await params;
  const token=request.nextUrl.searchParams.get('token');
  if(!token) return NextResponse.json({error:'Token obrigatório.'},{status:401});
  const db=createAdminClient();
  if(!db) return NextResponse.json({error:'Serviço indisponível.'},{status:503});
  const read=()=>db.rpc('get_public_order',{p_order_id:id,p_token:token});
  const initial=await read();
  if(initial.error||!initial.data) return NextResponse.json({error:'Link inválido ou expirado.'},{status:404});
  const encoder=new TextEncoder();
  let cleanup=()=>{};
  const stream=new ReadableStream<Uint8Array>({
    start(controller) {
      let closed=false, busy=false, last=JSON.stringify(initial.data);
      let channel:ReturnType<typeof db.channel>|undefined;
      let timer:ReturnType<typeof setInterval>|undefined;
      let lifetime:ReturnType<typeof setTimeout>|undefined;
      const send=(event:string,data:unknown)=>{if(!closed)controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));};
      cleanup=()=>{
        if(closed)return;
        closed=true;
        clearInterval(timer);clearTimeout(lifetime);
        request.signal.removeEventListener('abort',cleanup);
        if(channel)void db.removeChannel(channel);
        try { controller.close(); } catch { /* O cliente já cancelou a leitura. */ }
      };
      const refresh=async()=>{
        if(closed||busy)return;
        busy=true;
        try{
          const result=await read();
          if(closed)return;
          if(result.error){send('retrying',{});return;}
          if(!result.data){send('expired',{});cleanup();return;}
          const next=JSON.stringify(result.data);
          if(next!==last){last=next;send('order',result.data);}
        }catch{if(!closed)send('retrying',{});}finally{busy=false;}
      };
      send('order',initial.data);
      channel=db.channel(`customer-order-${initial.data.id}-${crypto.randomUUID()}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'orders',filter:`id=eq.${initial.data.id}`},()=>void refresh())
        .on('postgres_changes',{event:'*',schema:'public',table:'order_items',filter:`order_id=eq.${initial.data.id}`},()=>void refresh());
      channel.subscribe(status=>{if(status==='SUBSCRIBED')void refresh();});
      // Reconcilia reconexões, validade do token e mudanças que não gerem evento.
      timer=setInterval(()=>{if(!closed){controller.enqueue(encoder.encode(': keepalive\n\n'));void refresh();}},15000);
      lifetime=setTimeout(cleanup,270000);
      request.signal.addEventListener('abort',cleanup,{once:true});
      if(request.signal.aborted)cleanup();
    },
    cancel(){cleanup();},
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'private, no-cache, no-store, no-transform','X-Accel-Buffering':'no','Referrer-Policy':'no-referrer'}});
}
