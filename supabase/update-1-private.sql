-- Family Town update 1: keep it to just your family.
-- Paste into Supabase > SQL Editor > New query, then Run. Safe to run more than once.
-- After this, nobody else can start a new family in your project, and your family holds two people.
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
revoke all on function public.create_family() from public, anon;
grant execute on function public.create_family() to authenticated;
