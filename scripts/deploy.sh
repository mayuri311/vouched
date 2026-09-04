#!/usr/bin/env bash
# Ships Vouched to Vercel production and copies the two public Supabase
# keys into the project. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "No .env.local — copy .env.local.example and fill it in first." >&2
  exit 1
fi
set -a; . ./.env.local; set +a

if ! npx vercel whoami >/dev/null 2>&1; then
  echo "Not logged in. Run:  npx vercel login" >&2
  exit 1
fi

echo "→ Linking the project (accept the defaults if it asks)"
npx vercel link

# Only the NEXT_PUBLIC_ pair belongs in Vercel. The service role key stays
# on this machine — it is used by npm run seed and nothing else.
push_env() {
  local name="$1" value="$2"
  for env in production preview development; do
    npx vercel env rm "$name" "$env" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | npx vercel env add "$name" "$env" >/dev/null
  done
  echo "   set $name"
}

echo "→ Pushing environment variables"
push_env NEXT_PUBLIC_SUPABASE_URL      "$NEXT_PUBLIC_SUPABASE_URL"
push_env NEXT_PUBLIC_SUPABASE_ANON_KEY "$NEXT_PUBLIC_SUPABASE_ANON_KEY"

echo "→ Deploying to production"
npx vercel deploy --prod

REF=$(echo "$NEXT_PUBLIC_SUPABASE_URL" | sed -E 's#https://([^.]+)\.supabase\.co#\1#')
cat <<DONE

Deployed. One step left, or nobody can sign in:

  https://supabase.com/dashboard/project/$REF/auth/url-configuration

  Site URL       https://<your-domain>.vercel.app
  Redirect URLs  https://<your-domain>.vercel.app/auth/callback
                 https://<your-domain>-*.vercel.app/auth/callback
                 http://localhost:3000/auth/callback

DONE
