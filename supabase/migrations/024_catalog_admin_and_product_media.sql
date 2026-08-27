-- 024_catalog_admin_and_product_media.sql
-- CRUD seguro de catálogo e bairros + bucket público de imagens de produtos.

begin;

alter table public.categories add column if not exists deleted_at timestamptz;
alter table public.products add column if not exists deleted_at timestamptz;
alter table public.delivery_zones add column if not exists deleted_at timestamptz;

create index if not exists categories_active_catalog_idx on public.categories(sort_order, name) where deleted_at is null;
create index if not exists products_active_catalog_idx on public.products(category, active, name) where deleted_at is null;
create index if not exists delivery_zones_active_catalog_idx on public.delivery_zones(active, name) where deleted_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_category_fkey'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_category_fkey foreign key (category)
      references public.categories(id) on update cascade on delete restrict;
  end if;
end $$;

-- O bucket é público apenas para leitura das imagens no cardápio. As mutações
-- passam por rota server-side autorizada e service_role; não há policy de escrita
-- para anon/authenticated no storage.objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/avif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.system_migrations(version, name)
values (24, 'catalog_admin_and_product_media')
on conflict (version) do update set name = excluded.name;

commit;
