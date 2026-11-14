-- Family Town: Supabase setup
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run. Running it again is safe.
--
-- What it makes:
--   families  one row for your family (a join code for the second person, and a private calendar token)
--   members   who belongs to which family (you and Mollie)
--   kv        all the app's shared data, one row per key (groceries, events, chat, points...)
--   photos    a private storage bucket for daily photos
-- Privacy: every table only lets a signed-in member see and change their own family's rows.

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  ics_token text unique not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  user_id uuid primary key references auth.users on delete cascade,
  family_id uuid not null references public.families on delete cascade,
  joined_at timestamptz not null default now()
);

create table if not exists public.kv (
  family_id uuid not null references public.families on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  device text,
  primary key (family_id, key)
);
alter table public.kv add column if not exists device text;

-- Which family the signed-in person belongs to
create or replace function public.my_family() returns uuid
language sql stable security definer set search_path = public as $$
  select family_id from public.members where user_id = auth.uid()
$$;

alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.kv enable row level security;

drop policy if exists "see my family" on public.families;
create policy "see my family" on public.families for select to authenticated using (id = public.my_family());

drop policy if exists "see my family members" on public.members;
create policy "see my family members" on public.members for select to authenticated using (family_id = public.my_family());

drop policy if exists "family data" on public.kv;
create policy "family data" on public.kv for all to authenticated
  using (family_id = public.my_family()) with check (family_id = public.my_family());

-- Start a family (the first person). Returns the join code to give the second person.
create or replace function public.create_family() returns text
language plpgsql security definer set search_path = public as $$
declare fam uuid; c text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select f.code into c from public.members m join public.families f on f.id = m.family_id where m.user_id = auth.uid();
  if c is not null then return c; end if;
  if exists (select 1 from public.families) then raise exception 'This Family Town is private. Ask for the family code to join.'; end if;
  loop
    c := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from public.families where code = c);
  end loop;
  insert into public.families (code) values (c) returning id into fam;
  insert into public.members (user_id, family_id) values (auth.uid(), fam);
  return c;
end $$;

-- Join with the code (the second person). A family holds two people.
create or replace function public.join_family(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare fam uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select family_id into fam from public.members where user_id = auth.uid();
  if fam is not null then return fam; end if;
  select id into fam from public.families where code = upper(trim(p_code));
  if fam is null then raise exception 'That code doesn''t match a family'; end if;
  if (select count(*) from public.members where family_id = fam) >= 2 then raise exception 'That family already has two people'; end if;
  insert into public.members (user_id, family_id) values (auth.uid(), fam);
  return fam;
end $$;

revoke all on function public.create_family() from public, anon;
revoke all on function public.join_family(text) from public, anon;
grant execute on function public.create_family() to authenticated;
grant execute on function public.join_family(text) to authenticated;
grant execute on function public.my_family() to authenticated;

-- Live updates: the other phone hears changes right away
do $$ begin
  alter publication supabase_realtime add table public.kv;
exception when duplicate_object then null; end $$;

-- Private photo storage: files live under <family id>/...
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;

drop policy if exists "family photos read" on storage.objects;
create policy "family photos read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_family()::text);

drop policy if exists "family photos add" on storage.objects;
create policy "family photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_family()::text);

drop policy if exists "family photos remove" on storage.objects;
create policy "family photos remove" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_family()::text);
