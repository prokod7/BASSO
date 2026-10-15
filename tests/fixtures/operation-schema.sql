-- Metadata-only fixture for PostgreSQL transaction tests; no customer or production rows.
-- citext is represented as text: these tests exercise operations, not phone normalization.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create schema private;
create sequence public.order_number_seq start 1000;
create type public.app_role as enum ('manager','counter','waiter','kitchen','bar','driver','finance','viewer');
create type public.job_status as enum ('queued','processing','done','failed','cancelled');
create type public.order_channel as enum ('own_delivery','pickup','counter','dine_in','ifood','99food','table_qr');
create type public.order_status as enum ('received','confirmed','preparing','ready','out_for_delivery','completed','cancelled');
create type public.payment_method as enum ('pix','cash','debit','credit','meal_voucher','food_voucher','vr_refeicao','vr_alimentacao','sodexo','pluxe','alelo_refeicao','ticket_restaurante','voucher');
create type public.payment_status as enum ('pending','partial','paid','refunded','cancelled');
create table public.audit_logs (
  "id" bigint generated always as identity not null,
  "actor_id" uuid,
  "actor_label" text,
  "action" text not null,
  "entity_type" text not null,
  "entity_id" text not null,
  "origin" text default 'app'::text not null,
  "device_id" text,
  "ip_hash" text,
  "reason" text,
  "before_data" jsonb,
  "after_data" jsonb,
  "created_at" timestamp with time zone default now() not null
);
create table public.cash_movements (
  "id" uuid default gen_random_uuid() not null,
  "session_id" uuid not null,
  "kind" text not null,
  "amount_cents" integer not null,
  "reason" text not null,
  "payment_id" uuid,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.cash_sessions (
  "id" uuid default gen_random_uuid() not null,
  "opened_by" uuid not null,
  "opened_at" timestamp with time zone default now() not null,
  "initial_cents" integer not null,
  "status" text default 'open'::text not null,
  "closed_by" uuid,
  "closed_at" timestamp with time zone,
  "declared_cents" integer,
  "expected_cents" integer,
  "difference_cents" integer,
  "notes" text
);
create table public.categories (
  "id" text not null,
  "name" text not null,
  "kind" text not null,
  "sort_order" integer default 0 not null,
  "active" boolean default true not null,
  "image_url" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "deleted_at" timestamp with time zone
);
create table public.customers (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "phone" text not null,
  "email" text,
  "birth_date" date,
  "source" text default 'own'::text not null,
  "notes" text,
  "marketing_email" boolean default false not null,
  "marketing_push" boolean default false not null,
  "marketing_whatsapp" boolean default false not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "tags" text[] default '{}'::text[] not null,
  "blocked_at" timestamp with time zone,
  "blocked_reason" text
);
create table public.drivers (
  "id" uuid default gen_random_uuid() not null,
  "profile_id" uuid,
  "name" text not null,
  "phone" text not null,
  "vehicle" text,
  "active" boolean default true not null,
  "available" boolean default true not null,
  "active_order_id" text,
  "last_latitude" numeric(10,7),
  "last_longitude" numeric(10,7),
  "last_accuracy" numeric(10,2),
  "last_location_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "plate" text,
  "daily_rate_cents" integer default 0 not null,
  "per_delivery_cents" integer default 0 not null,
  "shift_started_at" timestamp with time zone,
  "shift_ended_at" timestamp with time zone,
  "notes" text
);
create table public.inventory_items (
  "id" uuid default gen_random_uuid() not null,
  "product_id" text not null,
  "unit" text default 'unidade'::text not null,
  "quantity" numeric(12,3) default 0 not null,
  "minimum_quantity" numeric(12,3) default 0 not null,
  "allow_negative" boolean default false not null,
  "version" integer default 1 not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.inventory_movements (
  "id" uuid default gen_random_uuid() not null,
  "inventory_item_id" uuid not null,
  "kind" text not null,
  "delta" numeric(12,3) not null,
  "order_id" text,
  "reason" text,
  "created_by" uuid,
  "idempotency_key" text,
  "created_at" timestamp with time zone default now() not null
);
create table public.loyalty_accounts (
  "customer_id" uuid not null,
  "balance" integer default 0 not null,
  "lifetime_points" integer default 0 not null,
  "rewards_redeemed" integer default 0 not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.loyalty_ledger (
  "id" uuid default gen_random_uuid() not null,
  "customer_id" uuid not null,
  "order_id" text,
  "delta" integer not null,
  "reason" text not null,
  "balance_after" integer not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null
);
create table public.order_items (
  "id" text not null,
  "order_id" text not null,
  "kind" text not null,
  "name_snapshot" text not null,
  "quantity" integer not null,
  "unit_price_cents" integer not null,
  "product_id" text,
  "selection" jsonb,
  "sector" text default 'kitchen'::text not null,
  "production_status" text default 'queued'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "cancelled_reason" text,
  "updated_by" uuid
);
create table public.order_status_history (
  "id" uuid default gen_random_uuid() not null,
  "order_id" text not null,
  "from_status" order_status,
  "to_status" order_status not null,
  "reason" text,
  "actor_id" uuid,
  "source" text default 'system'::text not null,
  "device_id" text,
  "created_at" timestamp with time zone default now() not null
);
create table public.orders (
  "id" text not null,
  "number" bigint not null,
  "channel" order_channel not null,
  "status" order_status default 'received'::order_status not null,
  "payment_status" payment_status default 'pending'::payment_status not null,
  "customer_id" uuid,
  "customer_name" text not null,
  "customer_phone" text default ''::text not null,
  "address" jsonb,
  "table_number" integer,
  "tab_id" uuid,
  "subtotal_cents" integer not null,
  "discount_cents" integer default 0 not null,
  "delivery_fee_cents" integer default 0 not null,
  "total_cents" integer not null,
  "payment_method" payment_method not null,
  "change_for_cents" integer,
  "notes" text,
  "coupon_code" text,
  "source_idempotency_key" text not null,
  "external_id" text,
  "external_payload" jsonb,
  "driver_id" uuid,
  "tracking_token_hash" text,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "priority" text default 'normal'::text not null,
  "estimated_ready_at" timestamp with time zone,
  "viewed_at" timestamp with time zone,
  "assigned_to" uuid,
  "internal_summary" text,
  "version" integer default 1 not null,
  "updated_by" uuid,
  "expedition_status" text default 'pending'::text not null,
  "expedition_checked_by" uuid,
  "expedition_checked_at" timestamp with time zone,
  "expedition_notes" text,
  "expedition_checklist" jsonb default '{}'::jsonb not null,
  "order_origin" text,
  "served_at" timestamp with time zone
);
create table public.payments (
  "id" uuid default gen_random_uuid() not null,
  "order_id" text,
  "tab_id" uuid,
  "method" payment_method not null,
  "status" payment_status not null,
  "amount_cents" integer not null,
  "provider" text,
  "external_id" text,
  "terminal_id" text,
  "authorization_code" text,
  "installments" integer default 1 not null,
  "idempotency_key" text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "nsu" text,
  "provider_transaction_id" text,
  "device_id" uuid
);
create table public.print_jobs (
  "id" uuid default gen_random_uuid() not null,
  "order_id" text,
  "tab_id" uuid,
  "sector" text not null,
  "printer_key" text not null,
  "payload" jsonb not null,
  "status" job_status default 'queued'::job_status not null,
  "attempts" integer default 0 not null,
  "is_reprint" boolean default false not null,
  "last_error" text,
  "next_attempt_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "processed_at" timestamp with time zone,
  "claimed_at" timestamp with time zone
);
create table public.print_profiles (
  "key" text not null,
  "name" text not null,
  "manufacturer" text,
  "model" text,
  "width_mm" integer default 80 not null,
  "paper_columns" integer default 42 not null,
  "connection_type" text default 'usb'::text not null,
  "connection_config" jsonb default '{}'::jsonb not null,
  "sector" text default 'kitchen'::text not null,
  "auto_print" boolean default false not null,
  "copies" integer default 1 not null,
  "active" boolean default true not null,
  "template" jsonb default '{"fontSize": "normal", "showLogo": false, "blockOrder": ["header", "customer", "items", "payment", "address", "notes"], "showAddress": true, "showPayment": true, "showCustomer": true, "highlightNotes": true, "highlightRemovals": true}'::jsonb not null,
  "updated_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.products (
  "id" text not null,
  "name" text not null,
  "category" text not null,
  "description" text default ''::text not null,
  "variant" text,
  "price_cents" integer not null,
  "image_url" text,
  "stock_tracked" boolean default false not null,
  "active" boolean default true not null,
  "available_channels" order_channel[] default ARRAY['own_delivery'::order_channel, 'pickup'::order_channel, 'counter'::order_channel, 'dine_in'::order_channel, 'table_qr'::order_channel] not null,
  "available_schedule" jsonb default '{}'::jsonb not null,
  "allergens" text[] default '{}'::text[] not null,
  "config" jsonb default '{}'::jsonb not null,
  "version" integer default 1 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "deleted_at" timestamp with time zone
);
create table public.profiles (
  "id" uuid not null,
  "display_name" text not null,
  "role" app_role not null,
  "active" boolean default true not null,
  "device_limit" integer default 3 not null,
  "permissions" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "last_seen_at" timestamp with time zone,
  "must_change_password" boolean default false not null,
  "preferred_view" jsonb default '{}'::jsonb not null,
  "password_changed_at" timestamp with time zone,
  "last_device_label" text
);
create table public.registered_devices (
  "id" uuid default gen_random_uuid() not null,
  "device_key" text not null,
  "device_type" text not null,
  "provider" text,
  "serial" text,
  "label" text not null,
  "assigned_profile_id" uuid,
  "active" boolean default true not null,
  "last_seen_at" timestamp with time zone,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.restaurant_tables (
  "number" integer not null,
  "capacity" integer not null,
  "status" text default 'free'::text not null,
  "people_count" integer,
  "opened_at" timestamp with time zone,
  "opened_by" uuid,
  "group_id" uuid,
  "version" integer default 1 not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.system_migrations (
  "version" integer not null,
  "name" text not null,
  "applied_at" timestamp with time zone default now() not null
);
create table public.tabs (
  "id" uuid default gen_random_uuid() not null,
  "table_number" integer not null,
  "name" text not null,
  "waiter_id" uuid,
  "status" text default 'open'::text not null,
  "paid_cents" integer default 0 not null,
  "opened_at" timestamp with time zone default now() not null,
  "closed_at" timestamp with time zone,
  "version" integer default 1 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "service_charge_rate_percent" numeric(5,2) default 10.00 not null,
  "service_charge_applied" boolean default true not null,
  "service_charge_cents" integer default 0 not null
);
create table public.tracking_tokens (
  "id" uuid default gen_random_uuid() not null,
  "order_id" text not null,
  "token_hash" text not null,
  "expires_at" timestamp with time zone not null,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "customer_visible" boolean default true not null,
  "delivered_at" timestamp with time zone,
  "token_value" text
);
alter table public.drivers add constraint "drivers_daily_rate_cents_check" CHECK ((daily_rate_cents >= 0));
alter table public.drivers add constraint "drivers_notes_check" CHECK ((char_length(notes) <= 1000));
alter table public.drivers add constraint "drivers_per_delivery_cents_check" CHECK ((per_delivery_cents >= 0));
alter table public.drivers add constraint "drivers_pkey" PRIMARY KEY (id);
alter table public.drivers add constraint "drivers_profile_id_key" UNIQUE (profile_id);
alter table public.print_jobs add constraint "print_jobs_pkey" PRIMARY KEY (id);
alter table public.order_items add constraint "broto_single_flavor" CHECK (((selection IS NULL) OR ((selection ->> 'size'::text) <> 'broto'::text) OR (COALESCE((selection ->> 'flavorB'::text), ''::text) = ''::text)));
alter table public.order_items add constraint "item_notes_limit" CHECK (((selection IS NULL) OR (char_length(COALESCE((selection ->> 'notes'::text), ''::text)) <= 500)));
alter table public.order_items add constraint "no_border_payload" CHECK (((selection IS NULL) OR ((NOT (selection ? 'border'::text)) AND (NOT (selection ? 'borda'::text)) AND (NOT (selection ? 'borderId'::text)) AND (NOT (selection ? 'bordaId'::text)))));
alter table public.order_items add constraint "order_items_kind_check" CHECK ((kind = ANY (ARRAY['pizza'::text, 'product'::text, 'combo'::text, 'reward'::text])));
alter table public.order_items add constraint "order_items_pkey" PRIMARY KEY (id);
alter table public.order_items add constraint "order_items_production_status_check" CHECK ((production_status = ANY (ARRAY['queued'::text, 'preparing'::text, 'ready'::text, 'cancelled'::text])));
alter table public.order_items add constraint "order_items_quantity_check" CHECK (((quantity >= 1) AND (quantity <= 99)));
alter table public.order_items add constraint "order_items_sector_check" CHECK ((sector = ANY (ARRAY['kitchen'::text, 'bar'::text, 'counter'::text])));
alter table public.order_items add constraint "order_items_unit_price_cents_check" CHECK ((unit_price_cents >= 0));
alter table public.orders add constraint "delivery_requires_address" CHECK (((channel <> 'own_delivery'::order_channel) OR (address IS NOT NULL)));
alter table public.orders add constraint "delivery_status_by_channel" CHECK (((status <> 'out_for_delivery'::order_status) OR (channel = ANY (ARRAY['own_delivery'::order_channel, 'ifood'::order_channel, '99food'::order_channel]))));
alter table public.orders add constraint "order_total_math" CHECK ((total_cents = GREATEST(0, ((subtotal_cents - discount_cents) + delivery_fee_cents))));
alter table public.orders add constraint "orders_delivery_fee_cents_check" CHECK ((delivery_fee_cents >= 0));
alter table public.orders add constraint "orders_discount_cents_check" CHECK ((discount_cents >= 0));
alter table public.orders add constraint "orders_expedition_checklist_object" CHECK ((jsonb_typeof(expedition_checklist) = 'object'::text));
alter table public.orders add constraint "orders_expedition_notes_check" CHECK ((char_length(expedition_notes) <= 1000));
alter table public.orders add constraint "orders_expedition_status_check" CHECK ((expedition_status = ANY (ARRAY['pending'::text, 'checking'::text, 'approved'::text, 'returned'::text])));
alter table public.orders add constraint "orders_internal_summary_check" CHECK ((char_length(internal_summary) <= 1000));
alter table public.orders add constraint "orders_notes_check" CHECK ((char_length(notes) <= 500));
alter table public.orders add constraint "orders_number_key" UNIQUE (number);
alter table public.orders add constraint "orders_order_origin_check" CHECK (((order_origin IS NULL) OR (order_origin = ANY (ARRAY['web'::text, 'whatsapp'::text, 'phone'::text, 'counter'::text, 'table'::text, 'marketplace'::text]))));
alter table public.orders add constraint "orders_pkey" PRIMARY KEY (id);
alter table public.orders add constraint "orders_priority_check" CHECK ((priority = ANY (ARRAY['normal'::text, 'high'::text, 'urgent'::text])));
alter table public.orders add constraint "orders_source_idempotency_key_key" UNIQUE (source_idempotency_key);
alter table public.orders add constraint "orders_subtotal_cents_check" CHECK ((subtotal_cents >= 0));
alter table public.orders add constraint "orders_total_cents_check" CHECK ((total_cents >= 0));
alter table public.customers add constraint "customers_phone_key" UNIQUE (phone);
alter table public.customers add constraint "customers_pkey" PRIMARY KEY (id);
alter table public.customers add constraint "customers_source_check" CHECK ((source = 'own'::text));
alter table public.tabs add constraint "tabs_paid_cents_check" CHECK ((paid_cents >= 0));
alter table public.tabs add constraint "tabs_pkey" PRIMARY KEY (id);
alter table public.tabs add constraint "tabs_service_charge_cents_check" CHECK ((service_charge_cents >= 0));
alter table public.tabs add constraint "tabs_service_charge_rate_check" CHECK (((service_charge_rate_percent >= (0)::numeric) AND (service_charge_rate_percent <= (100)::numeric)));
alter table public.tabs add constraint "tabs_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'partial'::text, 'closed'::text, 'cancelled'::text])));
alter table public.payments add constraint "payment_has_target" CHECK (((((order_id IS NOT NULL))::integer + ((tab_id IS NOT NULL))::integer) = 1));
alter table public.payments add constraint "payments_amount_cents_check" CHECK ((amount_cents > 0));
alter table public.payments add constraint "payments_idempotency_key_key" UNIQUE (idempotency_key);
alter table public.payments add constraint "payments_installments_check" CHECK ((installments > 0));
alter table public.payments add constraint "payments_pkey" PRIMARY KEY (id);
alter table public.products add constraint "products_category_check" CHECK ((category = ANY (ARRAY['beverages'::text, 'desserts'::text, 'combo'::text])));
alter table public.products add constraint "products_pkey" PRIMARY KEY (id);
alter table public.products add constraint "products_price_cents_check" CHECK ((price_cents >= 0));
alter table public.restaurant_tables add constraint "restaurant_tables_capacity_check" CHECK ((capacity = ANY (ARRAY[2, 5])));
alter table public.restaurant_tables add constraint "restaurant_tables_number_check" CHECK (((number >= 1) AND (number <= 15)));
alter table public.restaurant_tables add constraint "restaurant_tables_people_count_check" CHECK (((people_count IS NULL) OR (people_count >= 0)));
alter table public.restaurant_tables add constraint "restaurant_tables_pkey" PRIMARY KEY (number);
alter table public.restaurant_tables add constraint "restaurant_tables_status_check" CHECK ((status = ANY (ARRAY['free'::text, 'occupied'::text, 'cleaning'::text, 'partial'::text])));
alter table public.inventory_items add constraint "inventory_items_pkey" PRIMARY KEY (id);
alter table public.inventory_items add constraint "inventory_items_product_id_key" UNIQUE (product_id);
alter table public.inventory_items add constraint "stock_only_restricted_products" CHECK ((product_id IS NOT NULL));
alter table public.categories add constraint "categories_kind_check" CHECK ((kind = ANY (ARRAY['pizza'::text, 'beverage'::text, 'dessert'::text, 'combo'::text, 'addon'::text])));
alter table public.categories add constraint "categories_pkey" PRIMARY KEY (id);
alter table public.profiles add constraint "profiles_device_limit_check" CHECK ((device_limit > 0));
alter table public.profiles add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public.tracking_tokens add constraint "tracking_tokens_order_id_key" UNIQUE (order_id);
alter table public.tracking_tokens add constraint "tracking_tokens_pkey" PRIMARY KEY (id);
alter table public.tracking_tokens add constraint "tracking_tokens_token_hash_key" UNIQUE (token_hash);
alter table public.loyalty_accounts add constraint "loyalty_accounts_balance_check" CHECK (((balance >= 0) AND (balance <= 15)));
alter table public.loyalty_accounts add constraint "loyalty_accounts_lifetime_points_check" CHECK ((lifetime_points >= 0));
alter table public.loyalty_accounts add constraint "loyalty_accounts_pkey" PRIMARY KEY (customer_id);
alter table public.loyalty_accounts add constraint "loyalty_accounts_rewards_redeemed_check" CHECK ((rewards_redeemed >= 0));
alter table public.loyalty_ledger add constraint "loyalty_ledger_balance_after_check" CHECK (((balance_after >= 0) AND (balance_after <= 15)));
alter table public.loyalty_ledger add constraint "loyalty_ledger_delta_check" CHECK ((delta <> 0));
alter table public.loyalty_ledger add constraint "loyalty_ledger_order_id_reason_key" UNIQUE (order_id, reason);
alter table public.loyalty_ledger add constraint "loyalty_ledger_pkey" PRIMARY KEY (id);
alter table public.loyalty_ledger add constraint "loyalty_ledger_reason_check" CHECK ((reason = ANY (ARRAY['eligible_order'::text, 'reward_redemption'::text, 'manual_correction'::text])));
alter table public.audit_logs add constraint "audit_logs_pkey" PRIMARY KEY (id);
alter table public.order_status_history add constraint "order_status_history_pkey" PRIMARY KEY (id);
alter table public.cash_sessions add constraint "cash_sessions_initial_cents_check" CHECK ((initial_cents >= 0));
alter table public.cash_sessions add constraint "cash_sessions_pkey" PRIMARY KEY (id);
alter table public.cash_sessions add constraint "cash_sessions_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])));
alter table public.cash_movements add constraint "cash_movements_kind_check" CHECK ((kind = ANY (ARRAY['sale'::text, 'supply'::text, 'withdrawal'::text, 'refund'::text, 'adjustment'::text])));
alter table public.cash_movements add constraint "cash_movements_pkey" PRIMARY KEY (id);
alter table public.inventory_movements add constraint "inventory_movements_delta_check" CHECK ((delta <> (0)::numeric));
alter table public.inventory_movements add constraint "inventory_movements_idempotency_key_key" UNIQUE (idempotency_key);
alter table public.inventory_movements add constraint "inventory_movements_kind_check" CHECK ((kind = ANY (ARRAY['sale'::text, 'entry'::text, 'adjustment'::text, 'loss'::text, 'refund'::text])));
alter table public.inventory_movements add constraint "inventory_movements_pkey" PRIMARY KEY (id);
alter table public.print_profiles add constraint "print_profiles_connection_type_check" CHECK ((connection_type = ANY (ARRAY['usb'::text, 'network'::text, 'wifi'::text, 'bluetooth'::text, 'system'::text])));
alter table public.print_profiles add constraint "print_profiles_copies_check" CHECK (((copies >= 1) AND (copies <= 5)));
alter table public.print_profiles add constraint "print_profiles_paper_columns_check" CHECK (((paper_columns >= 24) AND (paper_columns <= 64)));
alter table public.print_profiles add constraint "print_profiles_pkey" PRIMARY KEY (key);
alter table public.print_profiles add constraint "print_profiles_width_mm_check" CHECK ((width_mm = ANY (ARRAY[58, 80])));
alter table public.system_migrations add constraint "system_migrations_pkey" PRIMARY KEY (version);
alter table public.registered_devices add constraint "registered_devices_device_key_key" UNIQUE (device_key);
alter table public.registered_devices add constraint "registered_devices_device_type_check" CHECK ((device_type = ANY (ARRAY['desktop'::text, 'tablet'::text, 'waiter_smartpos'::text, 'driver_phone'::text, 'kds'::text, 'other'::text])));
alter table public.registered_devices add constraint "registered_devices_pkey" PRIMARY KEY (id);
alter table public.drivers add constraint "drivers_active_order_id_fkey" FOREIGN KEY (active_order_id) REFERENCES orders(id);
alter table public.drivers add constraint "drivers_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id);
alter table public.print_jobs add constraint "print_jobs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.print_jobs add constraint "print_jobs_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);
alter table public.print_jobs add constraint "print_jobs_tab_id_fkey" FOREIGN KEY (tab_id) REFERENCES tabs(id);
alter table public.order_items add constraint "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.order_items add constraint "order_items_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);
alter table public.orders add constraint "orders_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES profiles(id);
alter table public.orders add constraint "orders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.orders add constraint "orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
alter table public.orders add constraint "orders_driver_fk" FOREIGN KEY (driver_id) REFERENCES drivers(id);
alter table public.orders add constraint "orders_expedition_checked_by_fkey" FOREIGN KEY (expedition_checked_by) REFERENCES profiles(id);
alter table public.orders add constraint "orders_tab_fk" FOREIGN KEY (tab_id) REFERENCES tabs(id);
alter table public.orders add constraint "orders_table_number_fkey" FOREIGN KEY (table_number) REFERENCES restaurant_tables(number);
alter table public.orders add constraint "orders_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);
alter table public.tabs add constraint "tabs_table_number_fkey" FOREIGN KEY (table_number) REFERENCES restaurant_tables(number);
alter table public.tabs add constraint "tabs_waiter_id_fkey" FOREIGN KEY (waiter_id) REFERENCES profiles(id);
alter table public.payments add constraint "payments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.payments add constraint "payments_device_id_fkey" FOREIGN KEY (device_id) REFERENCES registered_devices(id) ON DELETE SET NULL;
alter table public.payments add constraint "payments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);
alter table public.payments add constraint "payments_tab_id_fkey" FOREIGN KEY (tab_id) REFERENCES tabs(id);
alter table public.products add constraint "products_category_fkey" FOREIGN KEY (category) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;
alter table public.restaurant_tables add constraint "restaurant_tables_opened_by_fkey" FOREIGN KEY (opened_by) REFERENCES profiles(id);
alter table public.inventory_items add constraint "inventory_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
alter table public.profiles add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.tracking_tokens add constraint "tracking_tokens_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.loyalty_accounts add constraint "loyalty_accounts_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
alter table public.loyalty_ledger add constraint "loyalty_ledger_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.loyalty_ledger add constraint "loyalty_ledger_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
alter table public.loyalty_ledger add constraint "loyalty_ledger_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);
alter table public.audit_logs add constraint "audit_logs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id);
alter table public.order_status_history add constraint "order_status_history_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id);
alter table public.order_status_history add constraint "order_status_history_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.cash_sessions add constraint "cash_sessions_closed_by_fkey" FOREIGN KEY (closed_by) REFERENCES profiles(id);
alter table public.cash_sessions add constraint "cash_sessions_opened_by_fkey" FOREIGN KEY (opened_by) REFERENCES profiles(id);
alter table public.cash_movements add constraint "cash_movements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.cash_movements add constraint "cash_movements_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES payments(id);
alter table public.cash_movements add constraint "cash_movements_session_id_fkey" FOREIGN KEY (session_id) REFERENCES cash_sessions(id);
alter table public.inventory_movements add constraint "inventory_movements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.inventory_movements add constraint "inventory_movements_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id);
alter table public.inventory_movements add constraint "inventory_movements_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);
alter table public.print_profiles add constraint "print_profiles_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);
alter table public.registered_devices add constraint "registered_devices_assigned_profile_id_fkey" FOREIGN KEY (assigned_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
create function private.can_manage_operation() returns boolean language sql stable as $$select true$$;
alter table public.tabs enable row level security;
alter table public.restaurant_tables enable row level security;
grant usage on schema public,private,auth to anon,authenticated,service_role;
grant all on all tables in schema public to authenticated,service_role;

