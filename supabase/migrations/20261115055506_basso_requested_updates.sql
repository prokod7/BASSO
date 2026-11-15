-- Broto: two sweets or one sweet and one savory, enforced on every new/edited selection.
create or replace function public.validate_broto_item() returns trigger
language plpgsql set search_path='' as $$
declare a text; b text;
begin
  if new.selection->>'size'='broto' and coalesce(new.selection->>'flavorB','')<>'' then
    select category into a from public.pizza_flavors where id=new.selection->>'flavorA';
    select category into b from public.pizza_flavors where id=new.selection->>'flavorB';
    if a is null or b is null then raise exception 'Sabor de pizza indisponível'; end if;
    if a<>'sweet' and b<>'sweet' then raise exception 'Broto meio a meio precisa de pelo menos um sabor doce'; end if;
    if new.selection->>'flavorA'=new.selection->>'flavorB' then raise exception 'Escolha sabores diferentes'; end if;
  end if;
  return new;
end $$;
revoke all on function public.validate_broto_item() from public,anon,authenticated;
grant execute on function public.validate_broto_item() to service_role;

-- Basso: daily display numbers, linked drivers, versioned authorizations and atomic site edits.
-- IDs, permanent sequence and historical orders are preserved.
lock table public.orders in share row exclusive mode;
insert into private.daily_order_counters(business_date,last_number)
select business_date,max(daily_number) from public.orders group by business_date
on conflict(business_date) do update set last_number=greatest(daily_order_counters.last_number,excluded.last_number);
create or replace function private.assign_daily_order_number() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  new.business_date := (coalesce(new.created_at,now()) at time zone 'America/Sao_Paulo')::date;
  insert into private.daily_order_counters(business_date,last_number) values(new.business_date,1)
  on conflict(business_date) do update set last_number=daily_order_counters.last_number+1
  returning last_number into new.daily_number;
  return new;
end $$;
revoke all on function private.assign_daily_order_number() from public,anon,authenticated;
grant execute on function private.assign_daily_order_number() to service_role;

-- Creating or editing a driver profile synchronizes its operational record atomically.
create or replace function private.sync_driver_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.role='driver' then
    insert into public.drivers(profile_id,name,active,phone,vehicle)
    values(new.id,new.display_name,new.active,'','Moto')
    on conflict(profile_id) do update set name=excluded.name,active=excluded.active,updated_at=now();
  elsif tg_op='UPDATE' then
    if old.role='driver' and exists(select 1 from public.drivers where profile_id=new.id and active_order_id is not null) then
      raise exception 'Finalize ou transfira a entrega antes de mudar o perfil do motoboy';
    end if;
    update public.drivers set active=false,available=false,updated_at=now() where profile_id=new.id;
  end if;
  return new;
end $$;
revoke all on function private.sync_driver_profile() from public,anon,authenticated;
create trigger profiles_sync_driver after insert or update of role,display_name,active on public.profiles
for each row execute function private.sync_driver_profile();
insert into public.drivers(profile_id,name,active,phone,vehicle)
select id,display_name,active,'','Moto' from public.profiles where role='driver'
on conflict(profile_id) do update set name=excluded.name,active=excluded.active,updated_at=now();

create table public.driver_terms_documents (
  version text primary key check(length(version) between 1 and 80),
  title text not null,
  body text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index driver_terms_one_active on public.driver_terms_documents(active) where active;
create table public.driver_terms_acceptances (
  profile_id uuid not null references public.profiles(id),
  version text not null references public.driver_terms_documents(version),
  display_name text not null,
  accepted_at timestamptz not null default now(),
  primary key(profile_id,version)
);
alter table public.driver_terms_documents enable row level security;
alter table public.driver_terms_acceptances enable row level security;
revoke all on public.driver_terms_documents,public.driver_terms_acceptances from public,anon,authenticated;
grant select on public.driver_terms_documents,public.driver_terms_acceptances to authenticated;
grant select,insert,update on public.driver_terms_documents to service_role;
grant select on public.driver_terms_acceptances to service_role;
create policy driver_terms_read on public.driver_terms_documents for select to authenticated
using ((select private.current_role()) in ('manager','driver'));
create policy driver_acceptances_read on public.driver_terms_acceptances for select to authenticated
using (profile_id=(select auth.uid()) or (select private.current_role())='manager');

insert into public.driver_terms_documents(version,title,body,active) values (
'2026-11-15.1','Termos de uso e autorização do motoboy',
$terms$1. Conta e acesso
Utilize sua própria conta, mantenha a senha em sigilo e comunique imediatamente acessos indevidos. O acesso é pessoal e fica limitado às atividades de entrega autorizadas pela La Forneria Basso.

2. Responsabilidades na entrega
Confira o pedido e o endereço antes da saída, mantenha cuidado com os produtos, respeite as normas de trânsito e registre os estados de retirada, entrega e recebimento de valores de acordo com o que realmente aconteceu. Comunique incidentes ou divergências à equipe.

3. Dados dos clientes
Nome, telefone e endereço são disponibilizados para realizar a entrega. Não copie, divulgue ou utilize esses dados para finalidade pessoal ou comercial. Não compartilhe códigos de confirmação nem dados de acesso.

4. Localização durante o trabalho
Autorizo o compartilhamento da localização do aparelho com a pizzaria quando eu ativar o GPS durante o turno. Durante uma entrega em rota, a localização poderá ser exibida no acompanhamento privado do respectivo cliente. Posso pausar o GPS no painel e encerrar o turno após concluir a entrega. O navegador solicitará sua própria permissão de localização. O sistema utiliza as posições recentes para acompanhar o turno e a rota; o histórico do pedido permanece registrado.

5. Registro da autorização
Confirmo a leitura e aceito estas condições de utilização. O sistema registrará minha conta, o nome informado, a data, o horário e a versão integral deste documento. Uma nova versão exigirá novo aceite antes de continuar a operação. Em caso de dúvida ou discordância, devo procurar o responsável pela pizzaria antes de utilizar o sistema.$terms$,true);

-- Keep the accepted text immutable. Publish a new version instead of changing its body.
create or replace function private.preserve_driver_terms() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.version<>old.version or new.title<>old.title or new.body<>old.body then
    raise exception 'Publique uma nova versão dos termos; documentos existentes são imutáveis';
  end if;
  return new;
end $$;
revoke all on function private.preserve_driver_terms() from public,anon,authenticated;
create trigger driver_terms_immutable before update on public.driver_terms_documents
for each row execute function private.preserve_driver_terms();

create or replace function public.has_driver_authorization() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.driver_terms_documents d
    join public.driver_terms_acceptances a on a.version=d.version
    join public.profiles p on p.id=a.profile_id
    where d.active and a.profile_id=auth.uid() and p.active and p.role='driver'
  )
$$;
revoke all on function public.has_driver_authorization() from public,anon;
grant execute on function public.has_driver_authorization() to authenticated;

create or replace function public.accept_driver_terms(p_version text,p_name text) returns void
language plpgsql security definer set search_path='' as $$
declare v_document public.driver_terms_documents%rowtype;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='driver' and active and not must_change_password) then
    raise exception 'Acesso exclusivo do motoboy com senha atualizada';
  end if;
  if length(trim(p_name)) not between 2 and 100 then raise exception 'Informe seu nome completo'; end if;
  select * into v_document from public.driver_terms_documents where active for share;
  if not found or v_document.version<>p_version then raise exception 'Os termos foram atualizados. Recarregue e leia a nova versão'; end if;
  insert into public.driver_terms_acceptances(profile_id,version,display_name)
  values(auth.uid(),v_document.version,trim(p_name)) on conflict(profile_id,version) do nothing;
end $$;
revoke all on function public.accept_driver_terms(text,text) from public,anon;
grant execute on function public.accept_driver_terms(text,text) to authenticated;

create or replace function public.patch_business_settings(p_id uuid,p_patch jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare v_current public.business_settings%rowtype; v_config jsonb; v_in jsonb; v_site jsonb; v_in_site jsonb;
begin
  select * into strict v_current from public.business_settings where id=p_id for update;
  v_config:=coalesce(v_current.config,'{}'::jsonb); v_in:=coalesce(p_patch->'config','{}'::jsonb);
  v_site:=coalesce(v_config->'site','{}'::jsonb); v_in_site:=coalesce(v_in->'site','{}'::jsonb);
  v_site:=v_site||v_in_site||jsonb_build_object(
    'images',jsonb_strip_nulls(coalesce(v_site->'images','{}'::jsonb)||coalesce(v_in_site->'images','{}'::jsonb)),
    'sectionSubtitles',coalesce(v_site->'sectionSubtitles','{}'::jsonb)||coalesce(v_in_site->'sectionSubtitles','{}'::jsonb));
  v_config:=v_config||v_in||jsonb_build_object('site',v_site);
  update public.business_settings set
    name=coalesce(p_patch->>'name',name),cnpj=coalesce(p_patch->>'cnpj',cnpj),phone=coalesce(p_patch->>'phone',phone),
    instagram=coalesce(p_patch->>'instagram',instagram),address=coalesce(p_patch->'address',address),
    minimum_order_cents=coalesce((p_patch->>'minimum_order_cents')::integer,minimum_order_cents),
    opening_hours=coalesce(p_patch->'opening_hours',opening_hours),config=v_config,updated_at=now()
  where id=p_id;
end $$;
revoke all on function public.patch_business_settings(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.patch_business_settings(uuid,jsonb) to service_role;
create index wa_jobs_handoff_delivered on public.wa_jobs(delivered_at desc) where handoff and delivered_at is not null;
insert into public.system_migrations(version,name) values(51,'basso_requested_updates') on conflict(version) do nothing;
