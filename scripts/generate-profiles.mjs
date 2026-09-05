/**
 * Writes a Hinge profile for every startup that does not have one.
 *
 *   node --env-file=.env.local scripts/generate-profiles.mjs
 *   node --env-file=.env.local scripts/generate-profiles.mjs --dry-run
 *
 * Idempotent: only touches startups with no row in startup_profiles, so a
 * profile a person has written is never overwritten.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dryRun = process.argv.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const PROMPT_BANK = JSON.parse(
  readFileSync(join(root, "lib/prompts.json"), "utf8"),
);
const SEED = JSON.parse(readFileSync(join(root, "supabase/startups.json"), "utf8"));

/** Hand-written profiles that set the voice. Nothing teaches tone like
 *  examples — these do far more work than any instruction about being funny. */
const EXEMPLAR_SLUGS = [
  "cavalla",
  "herdcycle",
  "buoyant",
  "atom-limbs",
  "yummy-future",
  "cypherock",
  "deeptrust",
  "hayla",
];

const exemplars = EXEMPLAR_SLUGS.map((slug) => {
  const c = SEED.find((s) => s.slug === slug);
  if (!c) throw new Error(`Exemplar "${slug}" is not in supabase/startups.json`);
  return c;
});

/** Marketing tics. Any of these means the model reached for a stock phrase
 *  instead of the company's own specifics, which is the whole failure mode. */
const BANNED = [
  "leveraging",
  "leverage",
  "game-changing",
  "game changer",
  "revolutioniz",
  "the future of",
  "you've felt this pain",
  "cutting-edge",
  "seamless",
  "best-in-class",
  "disrupt",
  "synergy",
  "at scale, for everyone",
];

const SYSTEM = `You write dating-app profiles for startups.

Vouched is a Hinge-style app: people swipe through startups, and each one has
a profile made of three Hinge prompts. You write those three prompts.

## Voice

The company speaks in first person, the way a smart founder talks at a bar
after the pitch is over — dry, specific, self-aware, a little funny. Never
the way a landing page talks.

The joke always comes from what the company actually does. Generic startup
humour is a failure. If an answer could be pasted onto a different company,
it is wrong and you must write a different one.

## Rules

1. Choose exactly three prompts from the provided list. Copy each one
   VERBATIM — do not invent prompts or reword them.
2. Every answer must turn on a concrete detail from the company's
   description: a number, a material, a step in the workflow, a specific
   person who has this problem, a real constraint of the domain.
3. One to three sentences. Shorter is almost always better. A four-word
   answer that lands beats a clever paragraph.
4. Never use marketing language. Banned outright: ${BANNED.slice(0, 8).join(", ")}.
5. No em dashes in answers. Use a period or a comma.
6. Do not explain the joke. Do not end on a slogan.
7. Vary the three prompts — do not pick three that ask the same kind of
   question.

## Worked examples

These are hand-written and set the bar:

${exemplars
  .map(
    (c) =>
      `${c.name} — "${c.tagline}"\n` +
      c.prompts.map((p) => `  ${p.q}\n    ${p.a}`).join("\n"),
  )
  .join("\n\n")}

Notice what those do: forklifts vs. sharks, "load-bearing opinions" about ear
tags, an airship company admitting the decade is odd. Each is unusable for
any other company.`;

const ProfileSchema = z.object({
  prompts: z.array(z.object({ q: z.string(), a: z.string() })),
});

const anthropic = new Anthropic();
const supabase = createClient(url, key, { auth: { persistSession: false } });

/** Thin source material makes a flat profile. Say so rather than pretend. */
const isThin = (s) => !s.description || s.description.trim().length < 120;

function problems(prompts) {
  if (!Array.isArray(prompts) || prompts.length !== 3) return "not three prompts";
  const seen = new Set();
  for (const p of prompts) {
    if (!p?.q || !p?.a) return "empty prompt or answer";
    if (!PROMPT_BANK.includes(p.q)) return `invented prompt: "${p.q}"`;
    if (seen.has(p.q)) return `repeated prompt: "${p.q}"`;
    seen.add(p.q);
    const hit = BANNED.find((b) => p.a.toLowerCase().includes(b));
    if (hit) return `marketing phrase: "${hit}"`;
  }
  return null;
}

async function write(startup, retryNote = "") {
  const res = await anthropic.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: zodOutputFormat(ProfileSchema),
    },
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content:
          `Company: ${startup.name}\n` +
          `Tagline: ${startup.tagline}\n` +
          (startup.tags?.length ? `Tags: ${startup.tags.join(", ")}\n` : "") +
          (startup.batch ? `Batch: ${startup.batch}\n` : "") +
          `\nWhat they do:\n${startup.description || "(no description — work from the tagline alone)"}\n` +
          `\nPrompts you may choose from (copy verbatim):\n` +
          PROMPT_BANK.map((p) => `- ${p}`).join("\n") +
          retryNote,
      },
    ],
  });

  if (res.stop_reason === "refusal") {
    throw new Error(`declined: ${res.stop_details?.category ?? "unknown"}`);
  }
  return res.parsed_output?.prompts ?? null;
}

// Only startups with no profile at all.
const [{ data: startups, error: readError }, { data: haveProfiles }] =
  await Promise.all([
    supabase.from("startups").select("slug, name, tagline, tags, description, batch"),
    supabase.from("startup_profiles").select("slug"),
  ]);

if (readError) {
  console.error("Could not read the registry:", readError.message);
  process.exit(1);
}

const written = new Set((haveProfiles ?? []).map((r) => r.slug));
const todo = (startups ?? []).filter((s) => !written.has(s.slug));

if (!todo.length) {
  console.log("Every startup already has a profile.");
  process.exit(0);
}

console.log(`Writing ${todo.length} profile(s)${dryRun ? " (dry run)" : ""}…\n`);

const results = [];
const CONCURRENCY = 4;

for (let i = 0; i < todo.length; i += CONCURRENCY) {
  const batch = todo.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map(async (startup) => {
      try {
        let prompts = await write(startup);
        let issue = problems(prompts);

        if (issue) {
          // One retry, told exactly what was wrong. A second failure means
          // the source material cannot carry a profile.
          prompts = await write(
            startup,
            `\n\nYour previous attempt was rejected: ${issue}. ` +
              `Fix that and stay strictly inside the rules.`,
          );
          issue = problems(prompts);
        }

        if (issue) {
          console.log(`  ✗ ${startup.name} — ${issue}`);
          return;
        }

        results.push({
          slug: startup.slug,
          prompts,
          author_id: null,
          generated: true,
          thin: isThin(startup),
        });
        console.log(
          `  ✓ ${startup.name}${isThin(startup) ? "  (thin source)" : ""}`,
        );
        prompts.forEach((p) => console.log(`      ${p.q} → ${p.a}`));
      } catch (err) {
        const msg =
          err instanceof Anthropic.RateLimitError
            ? "rate limited — rerun to pick up where this left off"
            : err.message;
        console.log(`  ✗ ${startup.name} — ${msg}`);
      }
    }),
  );
}

console.log();

if (dryRun) {
  console.log(`Dry run: ${results.length} profile(s) written, nothing saved.`);
  process.exit(0);
}

if (!results.length) {
  console.log("Nothing to save.");
  process.exit(0);
}

const { error } = await supabase
  .from("startup_profiles")
  .upsert(results, { onConflict: "slug" });

if (error) {
  console.error("Could not save:", error.message);
  process.exit(1);
}

const thin = results.filter((r) => r.thin).length;
console.log(
  `Saved ${results.length} profile(s).` +
    (thin ? ` ${thin} flagged thin — they show a rewrite prompt on the card.` : ""),
);
