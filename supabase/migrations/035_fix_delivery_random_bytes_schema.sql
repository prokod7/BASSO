-- Corrige criação de entregas: pgcrypto está no schema extensions do Supabase.
create or replace function public.ensure_delivery_verification_row()
returns trigger language plpgsql security definer set search_path=public as $function$
begin
  if new.channel='own_delivery' then
    insert into public.delivery_verifications(order_id,pickup_token,pickup_code,delivery_code)
    values(new.id,encode(extensions.gen_random_bytes(24),'hex'),lpad((100000 + floor(random()*900000))::integer::text,6,'0'),lpad((100000 + floor(random()*900000))::integer::text,6,'0'))
    on conflict(order_id) do nothing;
  end if;
  return new;
end $function$;
insert into public.system_migrations(version,name) values(35,'fix_delivery_random_bytes_schema') on conflict(version) do nothing;
