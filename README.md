# Vouched

Tinder for the [Founders Inc portfolio](https://f.inc/portfolio). All 183
companies, each with three Hinge prompts written for them. Swipe right to
add to a company's score; write a signed vouch to add three times as much.
The ladder is public, the vouches carry a real name, and nothing is seeded —
it starts at zero.

- **Right swipe** `+1` — private. Nobody sees which way you swiped, only totals.
- **Vouch** `+3` — public, one line, attributed to your handle.
- **Status** — Unlisted → Noticed → Warm → Buzzing → Hot → Legend.

Reading the ladder needs no account. Moving it needs a verified
`@andrew.cmu.edu` address.

---

## Setup

### 1. Create a Supabase project

<https://supabase.com/dashboard> → New project. Free tier is plenty.

### 2. Run the schema

Open **SQL Editor** and run all of [`supabase/schema.sql`](supabase/schema.sql).
It creates the tables, the row-level security policies, the CMU signup gate,
and the three public views the leaderboard reads from.

### 3. Add your keys

```bash
cp .env.local.example .env.local
```

Fill in from **Project Settings → API**:

| Variable | Where | Safe in the browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / publishable key | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key | **no** — seeding only, never commit |

### 4. Load the registry

```bash
npm install
npm run seed     # upserts all 183 companies into `startups`
```

### 5. Point auth at your app

**Authentication → URL Configuration**:

- **Site URL** — `http://localhost:3000` while developing, your real domain in production.
- **Redirect URLs** — add both:
  - `http://localhost:3000/auth/callback`
  - `https://your-app.vercel.app/auth/callback`

A magic link that redirects anywhere not on that list will fail.

### 6. Run it

```bash
npm run dev
```

---

## Before you let real people in

**Set up your own SMTP.** Supabase's built-in email sender is rate limited to
a handful of messages per hour — fine for testing, not for a launch. Add a
provider under **Authentication → Emails → SMTP Settings**
([Resend](https://resend.com) has a free tier that covers this).
Without it, most sign-in links will silently never arrive.

**Check the CMU gate end to end.** Try signing in with a non-CMU address. The
`enforce_cmu_signup` trigger on `auth.users` refuses to create the account, so
Supabase returns a generic "Database error saving new user" rather than the
trigger's own message. The login form catches the common case before sending,
so the ugly error only shows for someone deliberately working around it.

**Decide whether swipes stay private.** Right now `swipes` has RLS letting you
read only your own rows, and the public counts come from `startup_scores`, a
view that runs as its owner so it can see across everyone. If you ever want a
"who passed on us" view for founders, that is the policy to change.

---

## Deploying

```bash
npx vercel
```

Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the
Vercel project's environment variables. `SUPABASE_SERVICE_ROLE_KEY` is not
needed in production — it is only used by the local seed script.

Then go back to step 5 and add the production callback URL.

---

## Layout

```
app/
  page.tsx              deck when signed in, landing when not
  login/                magic link request
  auth/callback/        exchanges the link for a session
  onboarding/           claim a handle, name, role, bio
  ladder/               public leaderboard, all 183
  scouts/               everyone vouching, ranked by vouches written
  s/[slug]/             a company: status, prompts, every vouch
  u/[handle]/           a person: bio and everything they vouched for
components/Deck.tsx     swipe mechanics, optimistic scoring, vouch sheet
lib/startups.ts         the 183 companies and their prompts (generated)
lib/score.ts            tier thresholds, shared by every surface
supabase/schema.sql     tables, RLS, public views
supabase/seed.mjs       loads the registry
public/logos/           188 company marks
```

## Where the data came from

Scraped once from `f.inc/portfolio` — name, tagline, category tags, and logo.
The Hinge prompt answers are written per company, not templated; the nine
portfolio entries that had no tagline on the registry are left out, which is
why the count is 183 and not 192.
