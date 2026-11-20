create or replace function public.wa_robot_report(period_days integer) returns jsonb
language sql stable set search_path=public,pg_temp as $$
  with bounds as (
    select case when period_days in (1,7,30) then
      (((now() at time zone 'America/Sao_Paulo')::date - (period_days-1))::timestamp at time zone 'America/Sao_Paulo')
      else '-infinity'::timestamptz end as since
  ), period_messages as (
    select direction, author, status, session_id, trim(regexp_replace(translate(lower(regexp_replace(coalesce(body,''), '^.*?Áudio: *', '', 'i')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g')) as words
    from wa_messages,bounds where created_at>=since
  ), messages as (
    select count(*) filter(where direction='in') received,
      count(distinct session_id) filter(where direction='in') contacts,
      count(*) filter(where direction='out' and author='bot' and status<>'failed') sent,
      count(*) filter(where direction='out' and author='agent' and status<>'failed') human,
      count(*) filter(where direction='out' and author='bot' and status='failed') failed,
      count(distinct session_id) filter(where direction='in' and author='customer'
        and words ~ $human$^(oi |ola |bom dia |boa tarde |boa noite )?(por favor )?(um |uma )?(humano|atendente|atendimento( humano)?)( por favor| pfv| pf| por gentileza)?$|\m(falar|conversar|chamar|chama|chame|quero|preciso|solicito|acionar|aciona|passa|passar|transfere|transferir|encaminhar)( (eu|me|pra|para|com|de|do|da|o|a|um|uma|pelo|pela|algum|alguma|seu|sua|ao|no)){0,5} (atendente|humano|atendimento|gerente|responsavel)\M|\m(falar|conversar) com (uma pessoa|alguem( da equipe| da loja| da pizzaria)?)( por favor)?( |$)|\m(alguem|pode|podem|consegue) (me atender|me passar para (um |uma )?atendente)\M$human$ and words !~ $excluded$\m(nao (quero|preciso|pedi|chame|chama|precisa)|dispenso|sem (atendente|atendimento|humano)|obrigad[oa] pel[oa] atendimento|bom atendimento|otimo atendimento|excelente atendimento|horario de atendimento)\M$excluded$) human_requests,
      count(*) filter(where direction='out' and author='bot' and status<>'failed'
        and words ~ $unclear$\m(nao (te |lhe |consegui |consigo |deu (para |pra )?)?(entendi|entender|compreendi|compreender)|nao ficou claro( pra mim| para mim)?|fiquei (em duvida sobre o (que|pedido)|sem entender)|nao consegui identificar (o sabor|o item|seu pedido|o que voce)|pode(ria)? (me |nos )?(repetir|reformular)|rep(ita|ete) (o pedido|a mensagem|o audio)|pode(ria)? (explicar|esclarecer) (melhor|de novo))\M$unclear$) misunderstood
    from period_messages
  ), sales as (
    select count(distinct o.id) orders, count(distinct j.session_id) buyers,
      coalesce(sum(o.total_cents),0) revenue
    from (select distinct on (order_result->>'id') order_result->>'id' as id, session_id
      from wa_jobs where order_result->>'id' is not null order by order_result->>'id',created_at,id) j
    join orders o on o.id::text=j.id cross join bounds
    where o.created_at>=since and o.status<>'cancelled' and o.deleted_at is null
  ), pending as (
    select count(*) carts,coalesce(sum((pending#>>'{quote,total}')::bigint),0) pipeline
    from wa_sessions s where not paused and (pending->>'expires')::timestamptz>now()
      and jsonb_typeof(pending#>'{quote,total}')='number'
      and not exists(select 1 from orders o where o.source_idempotency_key=s.pending#>>'{basket,idempotencyKey}')
  )
  select to_jsonb(messages)||to_jsonb(sales)||to_jsonb(pending) from messages,sales,pending;
$$;
revoke all on function public.wa_robot_report(integer) from public,anon,authenticated;
grant execute on function public.wa_robot_report(integer) to service_role;
