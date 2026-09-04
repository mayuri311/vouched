/**
 * Loads the 183 Founders Inc companies into the `startups` table.
 * Needs the service role key, because `startups` has no insert policy.
 *
 *   npm run seed
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

const { error } = await supabase
  .from("startups")
  .upsert(rows, { onConflict: "slug" });

if (error) {
  // PGRST205 is PostgREST saying the table is not in its schema cache —
  // almost always because schema.sql has not been run yet.
  if (error.code === "PGRST205") {
    const ref = url.replace(/^https:\/\/([^.]+)\.supabase\.co.*$/, "$1");
    console.error(
      "The `startups` table does not exist yet.\n\n" +
        "Run supabase/schema.sql first:\n" +
        `  https://supabase.com/dashboard/project/${ref}/sql/new\n\n` +
        "On macOS:  pbcopy < supabase/schema.sql\n" +
        "then paste it into that editor and hit Run. Then `npm run seed` again.",
    );
    process.exit(1);
  }
  console.error("Seed failed:", error.message);
  process.exit(1);
}

const { count } = await supabase
  .from("startups")
  .select("slug", { count: "exact", head: true });

console.log(`Seeded ${rows.length} companies. Table now holds ${count}.`);
