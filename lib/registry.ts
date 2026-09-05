export type Prompt = { q: string; a: string };

export type Source = "founders-inc" | "yc" | "producthunt" | "community";

/** One row of `deck_cards`: a startup joined to its profile. */
export type Card = {
  slug: string;
  name: string;
  tagline: string;
  tags: string[];
  source: Source;
  listed_at: string;
  website: string | null;
  logo_url: string | null;
  description: string | null;
  batch: string | null;
  /** Null until a profile exists — a card can be swiped before it is written. */
  prompts: Prompt[] | null;
  generated: boolean | null;
  thin: boolean | null;
  author_handle: string | null;
  author_name: string | null;
};

export const CARD_COLUMNS =
  "slug, name, tagline, tags, source, listed_at, website, logo_url, " +
  "description, batch, prompts, generated, thin, author_handle, author_name";

/** How many cards a single fetch pulls, and when to reach for the next page. */
export const PAGE_SIZE = 60;
export const TOP_UP_AT = 15;

export const SOURCE_LABEL: Record<Source, string> = {
  "founders-inc": "Founders Inc",
  yc: "Y Combinator",
  producthunt: "Product Hunt",
  community: "Added by a scout",
};
