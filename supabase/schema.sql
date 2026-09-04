-- Vouched — schema, access rules, and public scoreboards.
-- Paste this whole file into the Supabase SQL editor and run it once.

-- ─────────────────────────────────────────────────────────────
-- 1. The @andrew.cmu.edu gate
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_cmu(email text)
returns boolean
language sql
immutable
as $$
  select email is not null and lower(email) like '%@andrew.cmu.edu'
$$;

-- Refuse the account at creation time, so a non-CMU address never
-- becomes a user in the first place.
create or replace function public.enforce_cmu_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_cmu(new.email) then
    raise exception 'Vouched is open to @andrew.cmu.edu addresses only.'
      using errcode = '22023';
  end if;
  return new;
end
$$;

drop trigger if exists enforce_cmu_signup on auth.users;
create trigger enforce_cmu_signup
  before insert on auth.users
  for each row execute function public.enforce_cmu_signup();

-- ─────────────────────────────────────────────────────────────
-- 2. Tables
-- ─────────────────────────────────────────────────────────────

create table if not exists public.startups (
  slug     text primary key,
  name     text not null,
  tagline  text not null,
  tags     text[] not null default '{}'
);

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  handle       text unique not null check (handle ~ '^[a-z0-9_]{2,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio          text not null default '' check (char_length(bio) <= 240),
  role         text not null default '' check (char_length(role) <= 60),
  created_at   timestamptz not null default now()
);

-- A swipe is private. Only the aggregate is public.
create table if not exists public.swipes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  slug       text not null references public.startups(slug) on delete cascade,
  dir        smallint not null check (dir in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);

-- A vouch is public and signed. That is the whole point of it.
create table if not exists public.vouches (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  slug       text not null references public.startups(slug) on delete cascade,
  body       text not null default '' check (char_length(body) <= 140),
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);

create index if not exists swipes_slug_idx  on public.swipes (slug);
create index if not exists vouches_slug_idx on public.vouches (slug);
create index if not exists vouches_recent_idx on public.vouches (created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 3. Row level security
-- ─────────────────────────────────────────────────────────────

alter table public.startups enable row level security;
alter table public.profiles enable row level security;
alter table public.swipes   enable row level security;
alter table public.vouches  enable row level security;

-- The registry is readable by anyone, writable by no one (seed with the
-- service role key).
drop policy if exists "startups are public" on public.startups;
create policy "startups are public" on public.startups
  for select using (true);

-- Profiles are public pages. You may only write your own, and only with
-- a CMU token.
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles
  for select using (true);

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert with check (
    id = auth.uid() and public.is_cmu(auth.jwt() ->> 'email')
  );

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Swipes: you can only ever see and write your own rows.
drop policy if exists "read own swipes" on public.swipes;
create policy "read own swipes" on public.swipes
  for select using (user_id = auth.uid());

drop policy if exists "write own swipes" on public.swipes;
create policy "write own swipes" on public.swipes
  for insert with check (
    user_id = auth.uid() and public.is_cmu(auth.jwt() ->> 'email')
  );

drop policy if exists "change own swipes" on public.swipes;
create policy "change own swipes" on public.swipes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "erase own swipes" on public.swipes;
create policy "erase own swipes" on public.swipes
  for delete using (user_id = auth.uid());

-- Vouches: public to read, yours alone to write.
drop policy if exists "vouches are public" on public.vouches;
create policy "vouches are public" on public.vouches
  for select using (true);

drop policy if exists "write own vouch" on public.vouches;
create policy "write own vouch" on public.vouches
  for insert with check (
    user_id = auth.uid() and public.is_cmu(auth.jwt() ->> 'email')
  );

drop policy if exists "change own vouch" on public.vouches;
create policy "change own vouch" on public.vouches
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "erase own vouch" on public.vouches;
create policy "erase own vouch" on public.vouches
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 4. Public scoreboards
--
-- These run as the view owner on purpose: individual swipes stay
-- private under RLS, while the counts built from them are world
-- readable. That is what makes a logged-out ladder possible.
-- ─────────────────────────────────────────────────────────────

drop view if exists public.startup_scores;
create view public.startup_scores
with (security_invoker = false) as
select
  s.slug,
  s.name,
  s.tagline,
  s.tags,
  coalesce(w.rights,  0)::int as rights,
  coalesce(w.lefts,   0)::int as lefts,
  coalesce(v.vouches, 0)::int as vouches,
  (coalesce(w.rights, 0) + coalesce(v.vouches, 0) * 3)::int as score
from public.startups s
left join (
  select slug,
         count(*) filter (where dir =  1) as rights,
         count(*) filter (where dir = -1) as lefts
  from public.swipes
  group by slug
) w on w.slug = s.slug
left join (
  select slug, count(*) as vouches
  from public.vouches
  group by slug
) v on v.slug = s.slug;

grant select on public.startup_scores to anon, authenticated;

-- Signed vouches, joined to the person who left them.
drop view if exists public.vouch_feed;
create view public.vouch_feed
with (security_invoker = false) as
select
  v.slug,
  v.body,
  v.created_at,
  p.handle,
  p.display_name,
  p.role
from public.vouches v
join public.profiles p on p.id = v.user_id;

grant select on public.vouch_feed to anon, authenticated;

-- Per-person totals for the scout list.
drop view if exists public.scout_stats;
create view public.scout_stats
with (security_invoker = false) as
select
  p.handle,
  p.display_name,
  p.role,
  p.bio,
  p.created_at,
  coalesce(w.rights,  0)::int as rights,
  coalesce(v.vouches, 0)::int as vouches
from public.profiles p
left join (
  select user_id, count(*) filter (where dir = 1) as rights
  from public.swipes group by user_id
) w on w.user_id = p.id
left join (
  select user_id, count(*) as vouches
  from public.vouches group by user_id
) v on v.user_id = p.id;

grant select on public.scout_stats to anon, authenticated;
