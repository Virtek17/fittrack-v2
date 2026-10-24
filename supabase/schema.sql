-- Run once in the Supabase SQL Editor. Only the server service role can access diaries.
create table if not exists public.app_users (
  telegram_user_id bigint primary key,
  first_name text not null default '',
  username text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.app_users enable row level security;
revoke all on public.app_users from anon, authenticated;
grant select, insert, update on public.app_users to service_role;

create table if not exists public.diaries (
  telegram_user_id bigint primary key,
  data jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.diaries enable row level security;
revoke all on public.diaries from anon, authenticated;
grant select, insert, update on public.diaries to service_role;

-- A compare-and-swap inside one transaction prevents concurrent overwrites.
create or replace function public.save_diary(p_user_id bigint, p_revision integer, p_data jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare result integer;
begin
  if p_revision = 0 then
    insert into public.diaries(telegram_user_id, data, revision)
    values (p_user_id, p_data, 1) on conflict do nothing returning revision into result;
  else
    update public.diaries set data = p_data, revision = revision + 1, updated_at = now()
    where telegram_user_id = p_user_id and revision = p_revision returning revision into result;
  end if;
  return result;
end;
$$;
revoke all on function public.save_diary(bigint, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_diary(bigint, integer, jsonb) to service_role;
