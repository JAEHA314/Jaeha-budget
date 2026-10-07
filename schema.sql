create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date timestamptz not null,
  kind text not null check (kind in ('수입','지출','저축','투자')),
  category text not null,
  amount bigint not null check (amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  repeat_series_id text,
  repeat_frequency text,
  repeat_interval integer not null default 1,
  repeat_sequence integer not null default 0,
  repeat_anchor_date timestamptz
);
create index if not exists transactions_user_date_idx on public.transactions(user_id,date desc);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  custom_categories jsonb not null default '[]'::jsonb,
  monthly_budgets jsonb not null default '[]'::jsonb,
  savings_goals jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
alter table public.settings enable row level security;

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
