export type Tier = { min: number; name: string; bg: string; fg: string };

// A right swipe is worth one. A signed vouch is worth three — it costs
// more to give, so it moves the ladder more.
export const TIERS: Tier[] = [
  { min: 0, name: "Unlisted", bg: "var(--pass-soft)", fg: "var(--muted)" },
  { min: 1, name: "Noticed", bg: "var(--panel-2)", fg: "var(--ink-2)" },
  { min: 5, name: "Warm", bg: "var(--accent-soft)", fg: "var(--accent)" },
  { min: 15, name: "Buzzing", bg: "var(--accent-soft)", fg: "var(--accent)" },
  { min: 40, name: "Hot", bg: "var(--accent)", fg: "var(--accent-ink)" },
  { min: 100, name: "Legend", bg: "var(--ink)", fg: "var(--paper)" },
];

export function tierOf(score: number): Tier {
  return TIERS.reduce((best, t) => (score >= t.min ? t : best), TIERS[0]);
}

/** A row of `startup_scores`, which carries the company's own fields too,
 *  so a leaderboard needs no second lookup. */
export type Score = {
  slug: string;
  name: string;
  tagline: string;
  tags: string[];
  logo_url: string | null;
  source: string;
  listed_at: string;
  rights: number;
  lefts: number;
  vouches: number;
  score: number;
};

export const SCORE_COLUMNS =
  "slug, name, tagline, tags, logo_url, source, listed_at, rights, lefts, vouches, score";

export const EMPTY_SCORE = (slug: string, name = "", tagline = ""): Score => ({
  slug,
  name,
  tagline,
  tags: [],
  logo_url: null,
  source: "founders-inc",
  listed_at: new Date(0).toISOString(),
  rights: 0,
  lefts: 0,
  vouches: 0,
  score: 0,
});
