-- Family Town update 2: phone notifications.
-- Saves which phones want notifications. Each person can only add or remove their own phones.
-- Safe to run more than once.
create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  family_id  uuid not null references public.families(id) on delete cascade,
  slot       int,
  sub        jsonb not null,
  prefs      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "own phones" on public.push_subs;
create policy "own phones" on public.push_subs for all to authenticated
  using (user_id = auth.uid() and family_id = public.my_family())
  with check (user_id = auth.uid() and family_id = public.my_family());
