/**
 * Pulls a Y Combinator batch into the registry.
 *
 *   node --env-file=.env.local scripts/ingest-yc.mjs            # current batch
 *   node --env-file=.env.local scripts/ingest-yc.mjs fall-2026  # a named batch
 *
 * Source is yc-oss/api — a daily rebuild of YC's own public directory,
 * published as static JSON. Idempotent: upserts on slug.
 */
import { createClient } from "@supabase/supabase-js";

const API = "https://yc-oss.github.io/api";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const SEASONS = ["winter", "spring", "summer", "fall"];

/** Batches are named like "fall-2026". Sort on the name rather than trusting
 *  the order of keys in meta.json. */
function batchOrder(slug) {
  const m = /^(winter|spring|summer|fall)-(\d{4})$/.exec(slug);
  if (!m) return null;
  return Number(m[2]) * 10 + SEASONS.indexOf(m[1]);
}

/**
 * The newest batch that is actually populated.
 *
 * The literal newest is not what we want: a batch appears in the directory
 * with one or two companies months before the rest are announced, and
 * ingesting that gives a deck of one. Require a real cohort.
 */
async function currentBatch(minCount) {
  const meta = await (await fetch(`${API}/meta.json`)).json();
  const batches = Object.entries(meta.batches ?? {})
    .map(([slug, b]) => ({ slug, count: b.count ?? 0, order: batchOrder(slug) }))
    .filter((b) => b.order !== null)
    .sort((a, b) => a.order - b.order);

  const ready = batches.filter((b) => b.count >= minCount);
  if (!ready.length) {
    throw new Error(
      `No batch has ${minCount}+ companies. Largest is ` +
        batches.map((b) => `${b.slug} (${b.count})`).slice(-1) +
        `. Pass a batch name explicitly, or lower --min.`,
    );
  }

  const picked = ready[ready.length - 1];
  const newer = batches.filter((b) => b.order > picked.order && b.count > 0);
  if (newer.length) {
    console.log(
      `Skipping ${newer.map((b) => `${b.slug} (${b.count} so far)`).join(", ")} ` +
        `— not enough companies announced yet.`,
    );
  }
  return picked.slug;
}

const args = process.argv.slice(2);
const minArg = args.indexOf("--min");
const minCount = minArg === -1 ? 10 : Number(args[minArg + 1]);
const named = args.find((a) => !a.startsWith("--") && a !== String(minCount));

const batch = named || (await currentBatch(minCount));
console.log(`Batch: ${batch}`);

const res = await fetch(`${API}/batches/${batch}.json`);
if (!res.ok) {
  console.error(`Could not fetch batch "${batch}" (HTTP ${res.status}).`);
  process.exit(1);
}
const companies = await res.json();

const supabase = createClient(url, key, { auth: { persistSession: false } });

/** Company websites are the only reliable identity across sources. */
const domainOf = (site) => {
  try {
    return new URL(site).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

// A YC company often also launches on Product Hunt. Match on domain so the
// same company does not enter the deck twice under two slugs.
const { data: existing } = await supabase.from("startups").select("slug, website");
const takenSlugs = new Set((existing ?? []).map((r) => r.slug));
const takenDomains = new Set(
  (existing ?? []).map((r) => domainOf(r.website)).filter(Boolean),
);

const rows = [];
let skipped = 0;

for (const c of companies) {
  if (!c.name || !c.one_liner) continue;

  const domain = domainOf(c.website);
  const slug = `yc-${(c.slug || c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-|-$/g, "")}`;

  if (takenSlugs.has(slug) || (domain && takenDomains.has(domain))) {
    skipped++;
    continue;
  }
  takenSlugs.add(slug);
  if (domain) takenDomains.add(domain);

  const tags = [...new Set([c.industry, c.subindustry, ...(c.tags ?? [])])]
    .filter((t) => typeof t === "string" && t.trim())
    .slice(0, 5);

  rows.push({
    slug,
    name: c.name,
    tagline: c.one_liner,
    tags,
    source: "yc",
    website: c.website || null,
    logo_url: c.small_logo_thumb_url || null,
    description: (c.long_description || "").trim() || null,
    batch: c.batch || batch,
  });
}

if (!rows.length) {
  console.log(`Nothing new. ${skipped} already in the registry.`);
  process.exit(0);
}

const { error } = await supabase.from("startups").upsert(rows, { onConflict: "slug" });
if (error) {
  console.error("Ingest failed:", error.message);
  process.exit(1);
}

const thin = rows.filter((r) => !r.description || r.description.length < 120).length;
console.log(
  `Added ${rows.length} companies from ${batch}` +
    (skipped ? `, skipped ${skipped} already present` : "") +
    `.\n${thin} have thin descriptions and will be flagged for a rewrite.` +
    `\nRun scripts/generate-profiles.mjs to give them profiles.`,
);
