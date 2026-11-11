-- "Devolver ao robô": em vez de começar do zero, o robô relê a conversa (últimas 24 h, até
-- 40 mensagens, inclusive o que o atendente escreveu) e responde o que o cliente mandou depois
-- da última mensagem da loja.
create or replace function public.wa_control_session(sid uuid,p boolean) returns void
language plpgsql set search_path=public,pg_temp as $$
declare last_out timestamptz; ctx jsonb;
begin
  perform 1 from wa_sessions where id=sid for update;
  if not found then raise exception 'Conversa não encontrada'; end if;
  update wa_jobs set state='uncertain',error='Atendimento assumido durante envio; conferir conversa' where session_id=sid and state='sending';
  if p then
    update wa_jobs set state='skipped' where session_id=sid and state in('queued','processing');
    update wa_sessions set paused=true,pending=null,lease=null,lease_until=null,echo_paused_at=null,updated_at=now() where id=sid;
    return;
  end if;
  select max(created_at) into last_out from wa_messages where session_id=sid and direction='out';
  select coalesce(jsonb_agg(jsonb_build_object(
      'role', case when m.direction='in' then 'user' else 'assistant' end,
      'content', case when m.author='agent' then '[Atendente da loja]: '||m.body else m.body end) order by m.created_at),'[]'::jsonb)
    into ctx
    from (select * from wa_messages
          where session_id=sid and created_at>now()-interval '24 hours' and created_at<=coalesce(last_out,'-infinity'::timestamptz)
            and char_length(coalesce(body,''))>0
          order by created_at desc limit 40) m;
  -- O que o cliente mandou depois da última mensagem da loja volta para a fila: o robô responde.
  update wa_jobs set state='queued',attempts=0,error=null
    where session_id=sid and state in('queued','processing','skipped') and created_at>now()-interval '6 hours'
      and created_at>coalesce(last_out,'-infinity'::timestamptz);
  update wa_jobs set state='skipped' where session_id=sid and state in('queued','processing') and created_at<=coalesce(last_out,'-infinity'::timestamptz);
  update wa_sessions set paused=false,pending=null,history=ctx,lease=null,lease_until=null,echo_paused_at=null,updated_at=now() where id=sid;
end$$;

revoke all on function public.wa_control_session(uuid,boolean) from public,anon,authenticated;
grant execute on function public.wa_control_session(uuid,boolean) to service_role;

insert into public.system_migrations(version,name) values(48,'whatsapp_resume_with_context') on conflict(version) do nothing;
