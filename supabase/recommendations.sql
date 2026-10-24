-- Additional migration; safe to run after schema.sql. No access for browser roles.
create table if not exists public.ai_reports (
  telegram_user_id bigint not null,
  input_hash text not null,
  model text not null,
  status text not null check (status in ('pending','completed','failed')),
  request_id uuid not null,
  report jsonb,
  created_at timestamptz not null default now(),
  generated_at timestamptz,
  primary key (telegram_user_id, input_hash)
);
create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_created_at on public.ai_requests(created_at);
create index if not exists ai_requests_user_date on public.ai_requests(telegram_user_id, created_at);
alter table public.ai_reports enable row level security;
alter table public.ai_requests enable row level security;
revoke all on public.ai_reports, public.ai_requests from anon, authenticated;
grant select, insert, update on public.ai_reports to service_role;
grant select, insert on public.ai_requests to service_role;

create or replace function public.claim_ai_report(p_user_id bigint, p_hash text, p_model text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare cached public.ai_reports%rowtype; request_uuid uuid; day_start timestamptz;
begin
  perform pg_advisory_xact_lock(76423911);
  select * into cached from public.ai_reports where telegram_user_id = p_user_id and input_hash = p_hash;
  if cached.status = 'completed' then
    return jsonb_build_object('state','cached','report',cached.report,'generated_at',cached.generated_at,'model',cached.model);
  end if;
  if cached.status = 'pending' and cached.created_at > now() - interval '90 seconds' then
    return jsonb_build_object('state','pending');
  end if;
  day_start := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  if (select count(*) from public.ai_requests where telegram_user_id = p_user_id and created_at >= day_start) >= 2 then
    return jsonb_build_object('state','daily_limit');
  end if;
  if (select count(*) from public.ai_requests where created_at >= day_start) >= 25 then
    return jsonb_build_object('state','global_limit');
  end if;
  if exists (select 1 from public.ai_requests where created_at > now() - interval '60 seconds') then
    return jsonb_build_object('state','minute_limit');
  end if;
  insert into public.ai_requests(telegram_user_id) values (p_user_id) returning id into request_uuid;
  insert into public.ai_reports(telegram_user_id,input_hash,model,status,request_id)
  values (p_user_id,p_hash,p_model,'pending',request_uuid)
  on conflict (telegram_user_id,input_hash) do update set status='pending',request_id=excluded.request_id,model=excluded.model,report=null,created_at=now(),generated_at=null;
  return jsonb_build_object('state','claimed','request_id',request_uuid);
end;
$$;
revoke all on function public.claim_ai_report(bigint,text,text) from public, anon, authenticated;
grant execute on function public.claim_ai_report(bigint,text,text) to service_role;
