-- Mensagem automática do WhatsApp Business (saudação/ausência) chega como eco do celular
-- no mesmo segundo da mensagem do cliente e pausava o robô. Eco até 10 s depois de uma
-- mensagem do cliente é tratado como automático: aparece na caixa de entrada, mas não pausa.
alter table public.wa_sessions add column if not exists echo_paused_at timestamptz;

create or replace function public.wa_receive(p text,m text,b jsonb,echo boolean default false) returns void
language plpgsql set search_path=public,pg_temp as $$
declare s uuid; ts timestamptz:=coalesce(to_timestamp(nullif(b->>'timestamp','')::double precision),now());
begin
  insert into wa_sessions(phone) values(p) on conflict(phone) do nothing;
  select id into s from wa_sessions where phone=p for update;
  if echo then
    if exists(select 1 from wa_messages where session_id=s and direction='in'
      and created_at between ts-interval '10 seconds' and ts+interval '1 second') then return; end if;
    update wa_sessions set paused=true,pending=null,echo_paused_at=ts,updated_at=now() where id=s;
    return;
  end if;
  -- O eco automático chegou antes da mensagem do cliente: desfaz a pausa.
  update wa_sessions set paused=false,echo_paused_at=null
    where id=s and paused and echo_paused_at is not null and echo_paused_at between ts and ts+interval '10 seconds';
  insert into wa_jobs(session_id,message_id,payload) values(s,m,b) on conflict(message_id) do nothing;
  if found then
    update wa_sessions set last_inbound=greatest(last_inbound,ts),updated_at=now() where id=s;
  end if;
end$$;

create or replace function public.wa_agent_takeover(sid uuid) returns void
language plpgsql set search_path=public,pg_temp as $$
begin
  perform 1 from wa_sessions where id=sid for update;
  if not found then raise exception 'Conversa não encontrada'; end if;
  update wa_jobs set state='skipped' where session_id=sid and state='queued';
  update wa_sessions set paused=true,pending=null,echo_paused_at=null,updated_at=now() where id=sid;
end$$;

create or replace function public.wa_control_session(sid uuid,p boolean) returns void
language plpgsql set search_path=public,pg_temp as $$
begin
  perform 1 from wa_sessions where id=sid for update;
  if not found then raise exception 'Conversa não encontrada'; end if;
  update wa_jobs set state='skipped' where session_id=sid and state in('queued','processing');
  update wa_jobs set state='uncertain',error='Atendimento assumido durante envio; conferir conversa' where session_id=sid and state='sending';
  update wa_sessions set paused=p,pending=null,history='[]',lease=null,lease_until=null,echo_paused_at=null,updated_at=now() where id=sid;
end$$;

revoke all on function public.wa_receive(text,text,jsonb,boolean),public.wa_agent_takeover(uuid),public.wa_control_session(uuid,boolean) from public,anon,authenticated;
grant execute on function public.wa_receive(text,text,jsonb,boolean),public.wa_agent_takeover(uuid),public.wa_control_session(uuid,boolean) to service_role;

insert into public.system_migrations(version,name) values(44,'whatsapp_auto_reply_echo') on conflict(version) do nothing;
