-- 043: robô de atendimento no WhatsApp (mesma estrutura do robô da Bella Duda,
-- adaptada para loja única). Aditiva e DESLIGADA por padrão: não altera cardápio,
-- pedidos, caixa ou impressão. O robô só responde com WHATSAPP_BOT_ENABLED=true
-- na Vercel E wa_settings.enabled=true no painel.
--
-- Fluxo: webhook grava a mensagem (wa_messages + wa_jobs) antes do ACK; o worker
-- reivindica as mensagens pendentes da conversa quando o cliente para de digitar
-- (wa_claim), gera a resposta, grava (stage), marca envio (sending/sent).
-- Envio sem confirmação nunca é repetido: a conversa pausa para um atendente.

create table if not exists public.wa_settings(
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  quiet_seconds int not null default 15,
  max_wait_seconds int not null default 90,
  follow_up_seconds int not null default 300,
  -- Nome do recebedor do Pix como aparece no comprovante (conferência do comprovante).
  pix_name text,
  updated_at timestamptz not null default now(),
  constraint wa_settings_batching check (quiet_seconds between 0 and 60 and max_wait_seconds between quiet_seconds and 120),
  constraint wa_settings_follow_up check (follow_up_seconds between 0 and 86400)
);
insert into public.wa_settings(id) values(true) on conflict do nothing;

create table if not exists public.wa_sessions(
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  paused boolean not null default false,
  pending jsonb,
  history jsonb not null default '[]',
  last_inbound timestamptz,
  read_at timestamptz,
  lease uuid,
  lease_until timestamptz,
  follow_up_at timestamptz,
  followed_up_at timestamptz,
  -- Última vez que o robô mandou o link do cardápio (o lembrete não repete).
  menu_sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists wa_sessions_follow_up on public.wa_sessions(follow_up_at) where follow_up_at is not null;

create table if not exists public.wa_jobs(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wa_sessions(id) on delete cascade,
  message_id text not null unique,
  payload jsonb not null,
  state text not null default 'queued',
  attempts int not null default 0,
  handoff boolean not null default false,
  response text,
  outbound_id text,
  order_result jsonb,
  ai_usage jsonb,
  delivered_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists wa_jobs_queue on public.wa_jobs(state,created_at);
create index if not exists wa_jobs_session on public.wa_jobs(session_id,created_at);

create table if not exists public.wa_messages(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wa_sessions(id) on delete cascade,
  direction text not null check(direction in('in','out')),
  author text not null check(author in('customer','bot','agent')),
  kind text not null default 'text',
  body text not null default '' check(char_length(body)<=16000),
  wa_id text unique,
  status text not null default 'sent',
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_session on public.wa_messages(session_id,created_at);

-- Laboratório: conversa com o robô real sem enviar nada pelo WhatsApp.
create table if not exists public.wa_lab_sessions(
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner_id uuid,
  pending jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.wa_lab_messages(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wa_lab_sessions(id) on delete cascade,
  role text not null check(role in('user','assistant')),
  content text not null check(char_length(content)<=16000),
  intent text,
  usage jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wa_lab_messages_session on public.wa_lab_messages(session_id,created_at);

alter table public.wa_settings enable row level security;
alter table public.wa_sessions enable row level security;
alter table public.wa_jobs enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_lab_sessions enable row level security;
alter table public.wa_lab_messages enable row level security;
revoke all on public.wa_settings,public.wa_sessions,public.wa_jobs,public.wa_messages,public.wa_lab_sessions,public.wa_lab_messages from anon,authenticated;
grant all on public.wa_settings,public.wa_sessions,public.wa_jobs,public.wa_messages,public.wa_lab_sessions,public.wa_lab_messages to service_role;

-- Mensagem do cliente entra na fila (só com o robô ligado). Eco = atendente respondeu pelo celular: pausa o robô.
create or replace function public.wa_receive(p text,m text,b jsonb,echo boolean default false) returns void
language plpgsql set search_path=public,pg_temp as $$
declare s uuid;
begin
  insert into wa_sessions(phone) values(p) on conflict(phone) do nothing;
  select id into s from wa_sessions where phone=p for update;
  if echo then update wa_sessions set paused=true,pending=null,updated_at=now() where id=s; return; end if;
  insert into wa_jobs(session_id,message_id,payload) values(s,m,b) on conflict(message_id) do nothing;
  if found then
    update wa_sessions set last_inbound=greatest(last_inbound,to_timestamp((b->>'timestamp')::double precision)),updated_at=now() where id=s;
  end if;
end$$;

-- Reivindica todas as mensagens pendentes de uma conversa quando o cliente parou de digitar.
-- Primeira mensagem da conversa (sem resposta do robô nas últimas 6 h) é respondida na hora.
-- Sem conversa pronta, devolve {"wait": segundos}.
create or replace function public.wa_claim() returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare s wa_sessions; cfg wa_settings; l uuid:=gen_random_uuid(); jobs jsonb; due timestamptz;
begin
  select * into cfg from wa_settings where enabled;
  if not found then return null; end if;
  update wa_sessions set paused=true where lease_until<now() and exists(select 1 from wa_jobs where session_id=wa_sessions.id and state='sending');
  update wa_jobs set state='uncertain',error='Envio sem confirmação; conferir WhatsApp'
    where state='sending' and exists(select 1 from wa_sessions where id=wa_jobs.session_id and lease_until<now());
  select ws.* into s from wa_sessions ws
    join lateral (select max(created_at) newest,min(created_at) oldest from wa_jobs
      where session_id=ws.id and state in('queued','processing') and attempts<3) p on p.newest is not null
    cross join lateral (select
      make_interval(secs=>case when exists(select 1 from wa_jobs j where j.session_id=ws.id and j.state in('sent','merged')
        and j.created_at>now()-interval '6 hours') then cfg.quiet_seconds else 0 end) quiet,
      make_interval(secs=>cfg.max_wait_seconds) cap) w
    where not ws.paused and (ws.lease_until is null or ws.lease_until<now())
      and (p.newest<=now()-w.quiet or p.oldest<=now()-w.cap)
    order by ws.updated_at for update of ws skip locked limit 1;
  if s.id is null then
    select min(least(p.newest+w.quiet,p.oldest+w.cap)) into due
    from wa_sessions ws
    join lateral (select max(created_at) newest,min(created_at) oldest from wa_jobs
      where session_id=ws.id and state in('queued','processing') and attempts<3) p on p.newest is not null
    cross join lateral (select
      make_interval(secs=>case when exists(select 1 from wa_jobs j where j.session_id=ws.id and j.state in('sent','merged')
        and j.created_at>now()-interval '6 hours') then cfg.quiet_seconds else 0 end) quiet,
      make_interval(secs=>cfg.max_wait_seconds) cap) w
    where not ws.paused and (ws.lease_until is null or ws.lease_until<now());
    if due is null then return null; end if;
    return jsonb_build_object('wait',greatest(0.5,extract(epoch from due-now())));
  end if;
  if exists(select 1 from wa_jobs where session_id=s.id and state='sending') then
    update wa_sessions set paused=true where id=s.id; return null;
  end if;
  with batch as (
    update wa_jobs set state='processing',attempts=attempts+1
    where session_id=s.id and state in('queued','processing') and attempts<3 returning *)
  select jsonb_agg(to_jsonb(b) order by b.created_at,b.id) into jobs from batch b;
  update wa_sessions set lease=l,lease_until=now()+interval '4 minutes' where id=s.id;
  return jsonb_build_object('session',to_jsonb(s),'job',jobs->-1,'jobs',jobs,'lease',l,'claimed_at',now());
end$$;

-- Etapas de um lote. jid = mensagem principal (a última, ou a confirmação).
-- O pedido é criado pelo servidor (mesmo checkout do site, idempotente pela chave do resumo);
-- 'committed' registra o resultado e limpa o resumo, sob o mesmo lease.
create or replace function public.wa_transition(jid uuid,l uuid,op text,b jsonb default '{}') returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare j wa_jobs; s wa_sessions;
begin
  select * into j from wa_jobs where id=jid;
  select * into s from wa_sessions where id=j.session_id for update;
  if s.id is null or s.lease is distinct from l or s.lease_until<now() then raise exception 'LEASE_LOST'; end if;
  if op='release' then
    update wa_jobs set state=case when state='sending' then 'uncertain' when attempts>=3 then 'failed' else 'queued' end,
      error='Falha no processamento; conferir integração'
      where session_id=s.id and (id=jid or state='processing');
    update wa_sessions set lease=null,lease_until=null,paused=paused or j.state='sending' or j.attempts>=3 where id=s.id;
    return '{}';
  end if;
  if s.paused or not exists(select 1 from wa_settings where enabled) then
    update wa_jobs set state='skipped' where session_id=s.id and (id=jid or state='processing');
    update wa_sessions set lease=null,lease_until=null where id=s.id;
    return jsonb_build_object('stopped',true);
  end if;
  if op='check' then
    -- Antes de criar o pedido: o resumo confirmado ainda é o pendente e não expirou.
    if j.order_result is not null then return jsonb_build_object('order',j.order_result); end if;
    if s.pending is null or (s.pending->>'expires')::timestamptz<=now() or coalesce(b->>'code','') is distinct from s.pending->>'code' then
      raise exception 'CONFIRMATION_REQUIRED';
    end if;
    if s.pending->'basket'->>'paymentMethod'='pix' and (coalesce((s.pending->>'awaiting_receipt')::boolean,false) is not true or not b ? 'pix_receipt') then
      raise exception 'PIX_RECEIPT_REQUIRED';
    end if;
    return '{}';
  elsif op='committed' then
    update wa_jobs set order_result=b->'order' where id=jid and order_result is null;
    update wa_sessions set pending=null where id=s.id;
    return '{}';
  elsif op='stage' then
    -- Cliente continuou digitando enquanto a resposta era gerada: descarta e responde tudo junto.
    if coalesce((b->>'allow_supersede')::boolean,false) and b ? 'claimed_at'
      and exists(select 1 from wa_jobs where session_id=s.id and state='queued' and created_at>(b->>'claimed_at')::timestamptz) then
      update wa_jobs set state='queued',attempts=greatest(attempts-1,0) where session_id=s.id and state='processing';
      update wa_sessions set lease=null,lease_until=null where id=s.id;
      return jsonb_build_object('stopped',true,'superseded',true);
    end if;
    update wa_sessions set pending=nullif(b->'pending','null'::jsonb),history=b->'history',updated_at=now() where id=s.id;
    update wa_jobs set response=b->>'response',ai_usage=b->'usage',handoff=coalesce((b->>'pause')::boolean,false) where id=jid;
    update wa_jobs set state='merged' where session_id=s.id and state='processing' and id<>jid and (created_at,id)<(j.created_at,j.id);
    update wa_jobs set state='queued',attempts=greatest(attempts-1,0) where session_id=s.id and state='processing' and id<>jid;
    return '{}';
  elsif op='sending' then
    if s.last_inbound<now()-interval '23 hours 55 minutes' then
      update wa_jobs set state='expired' where id=jid;
      update wa_sessions set lease=null,lease_until=null where id=s.id;
      return jsonb_build_object('stopped',true);
    end if;
    update wa_jobs set state='sending' where id=jid;
    return '{}';
  elsif op='sent' then
    update wa_jobs set state='sent',outbound_id=b->>'outbound_id' where id=jid;
    insert into wa_messages(session_id,direction,author,body,wa_id,status)
      values(s.id,'out','bot',coalesce(j.response,''),b->>'outbound_id','sent') on conflict do nothing;
    update wa_sessions set lease=null,lease_until=null,paused=paused or coalesce((b->>'pause')::boolean,false),updated_at=now() where id=s.id;
    return '{}';
  elsif op='skip' then
    update wa_jobs set state='skipped' where session_id=s.id and (id=jid or state='processing');
    update wa_sessions set lease=null,lease_until=null where id=s.id;
    return '{}';
  end if;
  raise exception 'Invalid operation';
end$$;

-- Caixa de entrada: toda mensagem recebida ou enviada (mesmo com o robô desligado).
create or replace function public.wa_log_message(p text,m text,body text,kind text,direction text,author text,contact text default null,sent_at timestamptz default null) returns uuid
language plpgsql set search_path=public,pg_temp as $$
declare s uuid; at timestamptz:=coalesce(sent_at,now());
begin
  insert into wa_sessions(phone) values(p) on conflict(phone) do nothing;
  select id into s from wa_sessions where phone=p for update;
  if nullif(trim(coalesce(contact,'')),'') is not null then update wa_sessions set name=left(trim(contact),100) where id=s; end if;
  insert into wa_messages(session_id,direction,author,kind,body,wa_id,status,created_at)
    values(s,direction,author,coalesce(kind,'text'),left(coalesce(body,''),16000),m,case when direction='in' then 'received' else 'sent' end,at)
    on conflict do nothing;
  if direction='in' then update wa_sessions set last_inbound=greatest(last_inbound,at),updated_at=now(),follow_up_at=null where id=s;
  else update wa_sessions set updated_at=now() where id=s; end if;
  return s;
end$$;

-- Transcrição do áudio / leitura da imagem gravada na própria mensagem da caixa de entrada.
create or replace function public.wa_set_transcription(m text,txt text) returns void
language plpgsql set search_path=public,pg_temp as $$
begin
  update wa_messages set body=left(coalesce(txt,''),16000)
   where wa_id=m and direction='in' and kind in('audio','image','document','video')
     and nullif(trim(coalesce(txt,'')),'') is not null;
end$$;

-- Atendente assumiu: robô sai da conversa. Retomar: limpa contexto e descarta fila.
create or replace function public.wa_agent_takeover(sid uuid) returns void
language plpgsql set search_path=public,pg_temp as $$
begin
  perform 1 from wa_sessions where id=sid for update;
  if not found then raise exception 'Conversa não encontrada'; end if;
  update wa_jobs set state='skipped' where session_id=sid and state='queued';
  update wa_sessions set paused=true,pending=null,updated_at=now() where id=sid;
end$$;

create or replace function public.wa_control_session(sid uuid,p boolean) returns void
language plpgsql set search_path=public,pg_temp as $$
begin
  perform 1 from wa_sessions where id=sid for update;
  if not found then raise exception 'Conversa não encontrada'; end if;
  update wa_jobs set state='skipped' where session_id=sid and state in('queued','processing');
  update wa_jobs set state='uncertain',error='Atendimento assumido durante envio; conferir conversa' where session_id=sid and state='sending';
  update wa_sessions set paused=p,pending=null,history='[]',lease=null,lease_until=null,updated_at=now() where id=sid;
end$$;

create or replace function public.wa_inbox() returns jsonb
language sql stable set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_at desc nulls last),'[]'::jsonb) from (
    select s.id,s.phone,s.name,s.paused,s.last_inbound,s.updated_at,
      (select c.name from customers c
        where regexp_replace(c.phone::text,'\D','','g') in (s.phone,case when s.phone like '55%' then substr(s.phone,3) end) limit 1) customer_name,
      m.body last_body,m.author last_author,m.direction last_direction,m.status last_status,coalesce(m.created_at,s.updated_at) last_at,
      (select count(*) from wa_messages u where u.session_id=s.id and u.direction='in' and u.created_at>coalesce(s.read_at,'-infinity'::timestamptz))::int unread
    from wa_sessions s
    left join lateral (select body,author,direction,status,created_at from wa_messages where session_id=s.id order by created_at desc,id desc limit 1) m on true
    order by coalesce(m.created_at,s.updated_at) desc nulls last limit 300) x
$$;

-- Lembrete com o cardápio quando o cliente some (uma vez a cada 12 h, nunca aguardando Pix).
create or replace function public.wa_arm_follow_up(sid uuid) returns void
language plpgsql set search_path=public,pg_temp as $$
declare secs int;
begin
  select follow_up_seconds into secs from wa_settings where id;
  if coalesce(secs,0)<=0 then update wa_sessions set follow_up_at=null where id=sid; return; end if;
  update wa_sessions set follow_up_at=now()+make_interval(secs=>secs)
   where id=sid and coalesce((pending->>'awaiting_receipt')::boolean,false) is not true;
end$$;

create or replace function public.wa_due_follow_ups() returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare result jsonb;
begin
  -- Quem já recebeu o link do cardápio nas últimas 12 h não precisa do lembrete.
  update wa_sessions s set follow_up_at=null
   where s.follow_up_at is not null and s.follow_up_at<=now() and s.menu_sent_at>now()-interval '12 hours';
  with vencidas as (
    select s.id,s.phone from wa_sessions s
     where s.follow_up_at is not null and s.follow_up_at<=now() and s.paused is not true
       and coalesce((s.pending->>'awaiting_receipt')::boolean,false) is not true
       and (s.followed_up_at is null or s.followed_up_at<now()-interval '12 hours')
     order by s.follow_up_at limit 20 for update skip locked
  ), marcadas as (
    update wa_sessions s set follow_up_at=null,followed_up_at=now() from vencidas v where s.id=v.id returning s.id,s.phone
  )
  select coalesce(jsonb_agg(jsonb_build_object('session_id',id,'phone',phone)),'[]'::jsonb) into result from marcadas;
  return result;
end$$;

revoke all on function public.wa_receive(text,text,jsonb,boolean),public.wa_claim(),public.wa_transition(uuid,uuid,text,jsonb),
  public.wa_log_message(text,text,text,text,text,text,text,timestamptz),public.wa_set_transcription(text,text),
  public.wa_agent_takeover(uuid),public.wa_control_session(uuid,boolean),public.wa_inbox(),
  public.wa_arm_follow_up(uuid),public.wa_due_follow_ups() from public,anon,authenticated;
grant execute on function public.wa_receive(text,text,jsonb,boolean),public.wa_claim(),public.wa_transition(uuid,uuid,text,jsonb),
  public.wa_log_message(text,text,text,text,text,text,text,timestamptz),public.wa_set_transcription(text,text),
  public.wa_agent_takeover(uuid),public.wa_control_session(uuid,boolean),public.wa_inbox(),
  public.wa_arm_follow_up(uuid),public.wa_due_follow_ups() to service_role;

insert into public.system_migrations(version,name) values(43,'whatsapp_bot') on conflict(version) do nothing;
