-- Tempo de retirada e de entrega informado pelo robô; muda de dia para dia (Configurar robô).
alter table public.wa_settings add column if not exists pickup_time text check (char_length(pickup_time) <= 60);
alter table public.wa_settings add column if not exists delivery_time text check (char_length(delivery_time) <= 60);
alter table public.wa_settings add column if not exists wait_times_updated_at timestamptz;

insert into public.system_migrations(version,name) values(46,'whatsapp_wait_times') on conflict(version) do nothing;
