-- Fonte: cardápio de salão enviado pela Basso em IMG_9312.
-- Taças e copos não são incluídos: os nomes/preços estão cortados na foto.
insert into public.products(id,name,category,description,variant,price_cents,stock_tracked,active,available_channels)
values
 ('chopp-pilsen-caneca-500-ml','Chopp Pilsen — Caneca 500 ml','beverages','Consumo exclusivo no salão.',null,2000,false,true,array['dine_in','table_qr']::public.order_channel[]),
 ('chopp-vinho-caneca-500-ml','Chopp de Vinho — Caneca 500 ml','beverages','Consumo exclusivo no salão.',null,2000,false,true,array['dine_in','table_qr']::public.order_channel[]),
 ('balde-spaten-long-neck-6-unidades','Balde de Spaten Long Neck (6 unidades)','beverages','Balde com seis long necks. Exclusivo no salão.',null,5500,false,true,array['dine_in','table_qr']::public.order_channel[]),
 ('balde-heineken-long-neck-6-unidades','Balde de Heineken Long Neck (6 unidades)','beverages','Balde com seis long necks. Exclusivo no salão.',null,5500,false,true,array['dine_in','table_qr']::public.order_channel[]),
 ('balde-budweiser-long-neck-6-unidades','Balde de Budweiser Long Neck (6 unidades)','beverages','Balde com seis long necks. Exclusivo no salão.',null,5500,false,true,array['dine_in','table_qr']::public.order_channel[]),
 ('balde-corona-long-neck-6-unidades','Balde de Corona Long Neck (6 unidades)','beverages','Balde com seis long necks. Exclusivo no salão.',null,5500,false,true,array['dine_in','table_qr']::public.order_channel[])
on conflict(id) do nothing;

insert into public.system_migrations(version,name) values(40,'salon_drinks_catalog') on conflict(version) do nothing;
