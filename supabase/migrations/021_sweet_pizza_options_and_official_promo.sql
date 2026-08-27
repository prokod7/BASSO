-- 021_sweet_pizza_options_and_official_promo.sql
-- Mantém a promoção oficial de R$ 79,99 restrita a Calabresa Tradicional e Mozzarella.
-- As escolhas de base/corte das pizzas doces ficam no JSON de selection do item,
-- sem exigir alteração estrutural em order_items.

update public.products
set
  config = jsonb_set(
    coalesce(config, '{}'::jsonb),
    '{grandeFlavors}',
    '["calabresa-tradicional", "mozzarella"]'::jsonb,
    true
  ),
  description = 'Pizza Grande (Calabresa Tradicional ou Mozzarella) + Broto Brigadeiro + refrigerante 2 L selecionado.',
  updated_at = now()
where id = 'combo-grande-broto-refri'
  and category = 'combo';

insert into public.system_migrations(version, name)
values (21, 'sweet_pizza_options_and_official_promo')
on conflict (version) do update set name = excluded.name;
