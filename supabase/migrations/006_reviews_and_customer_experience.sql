-- Customer evaluation secured by the same private order access token.
create table public.order_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique references public.orders(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_reviews enable row level security;
create policy reviews_manager_read on public.order_reviews for select to authenticated using (public.current_role()='manager');

create or replace function public.create_public_order_review(
  p_order_id text,
  p_token text,
  p_rating integer,
  p_comment text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_status public.order_status;
begin
  if p_rating not between 1 and 5 then raise exception 'Nota inválida'; end if;
  if char_length(coalesce(p_comment,''))>1000 then raise exception 'Comentário muito longo'; end if;
  if not exists(
    select 1 from public.order_access_tokens
    where order_id=p_order_id
      and token_hash=encode(digest(p_token,'sha256'),'hex')
      and revoked_at is null and expires_at>now()
  ) then raise exception 'Link inválido ou expirado'; end if;
  select status into v_status from public.orders where id=p_order_id and deleted_at is null;
  if v_status is distinct from 'completed' then raise exception 'A avaliação fica disponível após a conclusão do pedido'; end if;
  insert into public.order_reviews(order_id,rating,comment)
  values(p_order_id,p_rating,nullif(trim(p_comment),''))
  on conflict(order_id) do update set rating=excluded.rating,comment=excluded.comment,updated_at=now()
  returning id into v_id;
  insert into public.audit_logs(actor_label,action,entity_type,entity_id,origin,after_data)
  values('Cliente','ORDER_REVIEWED','order',p_order_id,'public_review',jsonb_build_object('rating',p_rating));
  return v_id;
end $$;

grant execute on function public.create_public_order_review(text,text,integer,text) to anon,authenticated;
