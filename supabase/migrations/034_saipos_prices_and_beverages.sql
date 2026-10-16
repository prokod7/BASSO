-- Valores da lista ativa Saipos conferidos em 15/10/2026 e autorizados pelo cliente.
-- Somente preços diferentes são alterados; combos, promoções e disponibilidade são preservados.
-- Interrompe toda a operação se um preço tiver sido editado desde a conferência.
do $$
declare r record; f public.pizza_flavors%rowtype; p public.products%rowtype;
begin
  for r in select * from (values
    ('alho-e-oleo', 5000, 6000, 3500, 4000),
    ('bacon', 5500, 6000, 3750, 4000),
    ('baiana', 5500, 6000, 3750, 4000),
    ('bauru', 5500, 6000, 3750, 4000),
    ('bella-italia', 6700, 7000, 4350, 4500),
    ('brocolis', 5000, 5500, 3500, 3750),
    ('brocolis-ii', 6500, 6700, 4250, 4350),
    ('calabresa-com-mozzarella', 5200, 5900, 3750, 3950),
    ('cheddar', 5000, 5700, 3500, 3850),
    ('cinco-queijos', 6500, 7000, 4250, 4500),
    ('dois-queijos', 5500, 5700, 3750, 3850),
    ('escarola', 5500, 5800, 3900, null),
    ('frango-com-catupiry', 5700, 6300, 3850, 4150),
    ('frango-com-mozzarella', 5200, 6500, 3750, 4250),
    ('lombinho', 6000, 6300, 4000, 4150),
    ('margherita', 5500, 5700, 3750, 3850),
    ('mineira', 6500, 7200, 4250, 4600),
    ('napolitana', 5500, 5700, 3750, 3850),
    ('palmito', 5500, 6000, 3750, 4000),
    ('parmegiana', 5500, 6500, 3750, 4250),
    ('portuguesa', 6000, 6500, 4000, 4250),
    ('pepperoni', 5500, 6300, 3750, 4150),
    ('pepperoni-com-cream-cheese', 6000, 6700, 4000, 4350),
    ('quattro-formaggi', 6000, 6200, 4000, 4100),
    ('salame', 5500, 5700, 4150, 3850),
    ('tarantella', 6500, 7000, 4250, 4500),
    ('tomate-seco-com-rucula', 5500, 6200, 3750, 4100),
    ('toscana', 5500, 5900, 3750, 3950),
    ('tres-queijos', 5500, 5900, 3750, 3950),
    ('vegetariana', 5500, 6000, 3750, 4000),
    ('atum-solido-com-cream-cheese', 7000, 7500, 4500, 4750),
    ('seis-queijos', 7000, 7300, 4500, 4650),
    ('chocolate', 5500, 5600, 3800, null)
  ) as v(id, old_grande, new_grande, old_broto, new_broto)
  loop
    select * into f from public.pizza_flavors where id=r.id for update;
    if not found then raise exception 'Sabor ausente: %', r.id; end if;
    if (r.new_grande is not null and f.price_grande_cents not in (r.old_grande,r.new_grande))
      or (r.new_broto is not null and f.price_broto_cents not in (r.old_broto,r.new_broto)) then
      raise exception 'Preço alterado após conferência: %', r.id;
    end if;
    update public.pizza_flavors set
      price_grande_cents=coalesce(r.new_grande,price_grande_cents),
      price_broto_cents=coalesce(r.new_broto,price_broto_cents),
      version=version+1, updated_at=now()
    where id=r.id and
      ((r.new_grande is not null and price_grande_cents<>r.new_grande)
        or (r.new_broto is not null and price_broto_cents<>r.new_broto));
  end loop;
  for r in select * from (values ('coca-cola-1-l'),('coca-cola-zero-1-l')) as v(id)
  loop
    select * into p from public.products where id=r.id for update;
    if not found then raise exception 'Bebida ausente: %', r.id; end if;
    if p.price_cents not in (1100,1200) then raise exception 'Preço alterado após conferência: %', r.id; end if;
    update public.products set price_cents=1200,version=version+1,updated_at=now()
      where id=r.id and price_cents<>1200;
  end loop;
  insert into public.products(id,name,category,price_cents,stock_tracked,active) values
    ('vinho-semi-seco','Vinho Semi Seco','beverages',4500,false,true),
    ('suco-de-uva-integral-1-l','Suco de Uva Integral 1 L','beverages',3000,false,true),
    ('heineken-zero-long-neck','Heineken Zero Long Neck','beverages',1100,false,true)
  on conflict(id) do nothing;
end $$;
