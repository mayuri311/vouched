/**
 * Loads the 183 Founders Inc companies and their hand-written Hinge
 * profiles into Supabase. Needs the service role key, because `startups`
 * only accepts community rows from the browser.
 *
 *   npm run seed
 *
 * Safe to re-run: everything upserts on slug. Re-running does NOT clobber
 * a profile a person has rewritten.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Copy .env.local.example to .env.local and fill both in.",
  );
  process.exit(1);
}

const rows = JSON.parse(readFileSync(join(here, "startups.json"), "utf8"));
const supabase = createClient(url, key, { auth: { persistSession: false } });

const fail = (label, error) => {
  if (!error) return;
  if (error.code === "PGRST205") {
    const ref = url.replace(/^https:\/\/([^.]+)\.supabase\.co.*$/, "$1");
    console.error(
      `${label}: that table does not exist yet.\n\n` +
        "Run supabase/schema.sql and then supabase/002_living_registry.sql:\n" +
        `  https://supabase.com/dashboard/project/${ref}/sql/new\n\n` +
        "On macOS:  pbcopy < supabase/schema.sql\n" +
        "then paste, Run, and repeat for 002_living_registry.sql.",
    );
  } else {
    console.error(`${label}:`, error.message);
  }
  process.exit(1);
};

// 1. The companies themselves.
const { error: startupError } = await supabase.from("startups").upsert(
  rows.map(({ prompts, ...startup }) => startup),
  { onConflict: "slug" },
);
fail("Seeding startups", startupError);

// 2. Their profiles — but never overwrite one a person has since written.
const { data: written } = await supabase
  .from("startup_profiles")
  .select("slug")
  .eq("generated", false)
  .not("author_id", "is", null);

const humanWritten = new Set((written ?? []).map((r) => r.slug));

const profiles = rows
  .filter((r) => !humanWritten.has(r.slug))
  .map((r) => ({
    slug: r.slug,
    prompts: r.prompts,
    author_id: null,
    generated: false, // hand-written by us, not by a model
    thin: false,
  }));

const { error: profileError } = await supabase
  .from("startup_profiles")
  .upsert(profiles, { onConflict: "slug" });
fail("Seeding profiles", profileError);

const { count } = await supabase
  .from("startups")
  .select("slug", { count: "exact", head: true });

console.log(
  `Seeded ${rows.length} companies and ${profiles.length} profiles. ` +
    `Registry now holds ${count}.` +
    (humanWritten.size ? ` Left ${humanWritten.size} rewritten profile(s) alone.` : ""),
);
