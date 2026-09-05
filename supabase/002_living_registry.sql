-- Vouched — migration 002: a registry that grows.
-- Run this in the Supabase SQL editor after schema.sql.

-- ─────────────────────────────────────────────────────────────
-- 1. Startups gain a provenance and a listing date
-- ─────────────────────────────────────────────────────────────

alter table public.startups
  add column if not exists source       text not null default 'founders-inc',
  add column if not exists listed_at    timestamptz not null default now(),
  add column if not exists website      text,
  add column if not exists logo_url     text,
  add column if not exists description  text,
  add column if not exists batch        text,
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null;

alter table public.startups
  drop constraint if exists startups_source_check;
alter table public.startups
  add constraint startups_source_check
  check (source in ('founders-inc', 'yc', 'producthunt', 'community'));

create index if not exists startups_listed_at_idx on public.startups (listed_at desc);
create index if not exists startups_source_idx    on public.startups (source);

-- ─────────────────────────────────────────────────────────────
-- 2. Profiles: the three Hinge answers, generated or written
-- ─────────────────────────────────────────────────────────────

create table if not exists public.startup_profiles (
  slug       text primary key references public.startups(slug) on delete cascade,
  prompts    jsonb not null,
  author_id  uuid references public.profiles(id) on delete set null,  -- null = generated
  generated  boolean not null default false,
  -- Thin source material makes a flat profile. Flagged at ingest so the
  -- deck can ask a human to rewrite these first.
  thin       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists startup_profiles_author_idx on public.startup_profiles (author_id);

alter table public.startup_profiles enable row level security;

drop policy if exists "profiles of startups are public" on public.startup_profiles;
create policy "profiles of startups are public" on public.startup_profiles
  for select using (true);

-- You may write a profile under your own name, with a CMU token.
drop policy if exists "write a startup profile" on public.startup_profiles;
create policy "write a startup profile" on public.startup_profiles
  for insert with check (
    author_id = auth.uid()
    and generated = false
    and public.is_cmu(auth.jwt() ->> 'email')
  );

-- Anyone may take over a generated profile; only the author may edit a
-- written one. Either way the result is signed by whoever saved it.
drop policy if exists "rewrite a startup profile" on public.startup_profiles;
create policy "rewrite a startup profile" on public.startup_profiles
  for update using (
    public.is_cmu(auth.jwt() ->> 'email')
    and (generated = true or author_id = auth.uid())
  ) with check (
    author_id = auth.uid() and generated = false
  );

-- ─────────────────────────────────────────────────────────────
-- 3. Community submissions
-- ─────────────────────────────────────────────────────────────

drop policy if exists "submit a startup" on public.startups;
create policy "submit a startup" on public.startups
  for insert with check (
    submitted_by = auth.uid()
    and source = 'community'
    and public.is_cmu(auth.jwt() ->> 'email')
  );

-- ─────────────────────────────────────────────────────────────
-- 4. Rising — score earned in the last 7 days
--
-- A company listed yesterday cannot out-rank one that has been
-- accumulating for months. Rising gives new arrivals somewhere to
-- compete. Runs as owner, like startup_scores, so the counts are
-- public while individual swipes stay private.
-- ─────────────────────────────────────────────────────────────

drop view if exists public.startup_rising;
create view public.startup_rising
with (security_invoker = false) as
select
  s.slug,
  s.name,
  s.tagline,
  s.source,
  s.listed_at,
  coalesce(w.rights,  0)::int as rights,
  coalesce(v.vouches, 0)::int as vouches,
  (coalesce(w.rights, 0) + coalesce(v.vouches, 0) * 3)::int as score
from public.startups s
left join (
  select slug, count(*) filter (where dir = 1) as rights
  from public.swipes
  where created_at > now() - interval '7 days'
  group by slug
) w on w.slug = s.slug
left join (
  select slug, count(*) as vouches
  from public.vouches
  where created_at > now() - interval '7 days'
  group by slug
) v on v.slug = s.slug;

grant select on public.startup_rising to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. Deck feed — startups joined to their profile, newest first
-- ─────────────────────────────────────────────────────────────

drop view if exists public.deck_cards;
create view public.deck_cards
with (security_invoker = false) as
select
  s.slug, s.name, s.tagline, s.tags, s.source, s.listed_at,
  s.website, s.logo_url, s.description, s.batch,
  p.prompts, p.generated, p.thin, p.author_id,
  a.handle as author_handle,
  a.display_name as author_name
from public.startups s
left join public.startup_profiles p on p.slug = s.slug
left join public.profiles a on a.id = p.author_id;

grant select on public.deck_cards to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Rebuild startup_scores so leaderboards can render a logo and
--    show provenance without a second query.
-- ─────────────────────────────────────────────────────────────

drop view if exists public.startup_scores;
create view public.startup_scores
with (security_invoker = false) as
select
  s.slug,
  s.name,
  s.tagline,
  s.tags,
  s.logo_url,
  s.source,
  s.listed_at,
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
