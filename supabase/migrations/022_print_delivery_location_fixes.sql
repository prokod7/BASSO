-- 022_print_delivery_location_fixes.sql
-- Corrige roteamento de impressão por setor e evita que jobs históricos
-- sejam impressos em lote quando o Print Bridge voltar a ficar online.

-- A cozinha deve acompanhar o comportamento real da fila automática.
update public.print_profiles
set auto_print = true,
    updated_at = now()
where key = 'kitchen-main'
  and active = true;

-- Jobs antigos ficaram represados porque o bridge local nunca concluiu o heartbeat.
-- Cancelamos somente trabalhos sem processamento e antigos; reimpressões novas continuam intactas.
update public.print_jobs
set status = 'cancelled'::public.job_status,
    last_error = 'Job histórico cancelado pelo MU12 antes da reativação do Print Bridge',
    processed_at = now(),
    claimed_at = null,
    next_attempt_at = null
where status in ('queued'::public.job_status, 'failed'::public.job_status, 'processing'::public.job_status)
  and created_at < now() - interval '30 minutes';

create or replace function public.enqueue_order_print_jobs(p_order_id text)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer := 0;
  v_sector text;
  v_payload jsonb;
  v_printer_key text;
begin
  if not exists(select 1 from public.orders where id=p_order_id) then
    raise exception 'Pedido não encontrado';
  end if;

  -- Vias de produção: somente setores com perfil ativo/automático.
  for v_sector in
    select distinct i.sector
    from public.order_items i
    where i.order_id=p_order_id
      and i.production_status<>'cancelled'
  loop
    v_printer_key := case
      when v_sector='bar' then 'bar'
      when v_sector='counter' then 'counter'
      else 'cozinha'
    end;

    if exists (
      select 1
      from public.print_profiles p
      where p.active
        and p.auto_print
        and (
          (v_sector='kitchen' and p.sector='kitchen')
          or (v_sector='bar' and p.sector='bar')
          or (v_sector='counter' and p.sector='counter')
        )
    ) then
      select jsonb_build_object(
        'order',(select to_jsonb(o) from public.orders o where o.id=p_order_id),
        'items',coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb)
      ) into v_payload
      from public.order_items i
      where i.order_id=p_order_id
        and i.sector=v_sector
        and i.production_status<>'cancelled';

      insert into public.print_jobs(order_id,sector,printer_key,payload)
      select p_order_id,v_sector,v_printer_key,v_payload
      where not exists(
        select 1
        from public.print_jobs j
        where j.order_id=p_order_id
          and j.sector=v_sector
          and not j.is_reprint
      );

      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  -- Via completa de balcão/expedição: contém todos os itens, total, pagamento e endereço.
  -- Não depende do setor de produção dos itens.
  if exists (
    select 1 from public.print_profiles p
    where p.active and p.auto_print and p.sector='counter'
  ) then
    select jsonb_build_object(
      'order',(select to_jsonb(o) from public.orders o where o.id=p_order_id),
      'items',coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb)
    ) into v_payload
    from public.order_items i
    where i.order_id=p_order_id
      and i.production_status<>'cancelled';

    insert into public.print_jobs(order_id,sector,printer_key,payload)
    select p_order_id,'counter','counter',v_payload
    where not exists(
      select 1
      from public.print_jobs j
      where j.order_id=p_order_id
        and j.sector='counter'
        and not j.is_reprint
    );

    if found then v_count := v_count + 1; end if;
  end if;

  return v_count;
end $$;

grant execute on function public.enqueue_order_print_jobs(text) to authenticated,service_role;

insert into public.system_migrations(version, name)
values (22, 'print_delivery_location_fixes')
on conflict (version) do update set name = excluded.name;
