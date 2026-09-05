import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CARD_COLUMNS, SOURCE_LABEL, type Card } from "@/lib/registry";
import { EMPTY_SCORE, SCORE_COLUMNS, tierOf, type Score } from "@/lib/score";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

async function getCard(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deck_cards")
    .select(CARD_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  return ((data as unknown) as Card | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = await getCard(slug);
  return card
    ? { title: `${card.name} · Vouched`, description: card.tagline }
    : { title: "Not found · Vouched" };
}

type Vouch = {
  body: string;
  created_at: string;
  handle: string;
  display_name: string;
  role: string;
};

export default async function StartupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = await getCard(slug);
  if (!card) notFound();

  const supabase = await createClient();
  const [{ data: scoreRow }, { data: vouches }, { count: above }] =
    await Promise.all([
      supabase
        .from("startup_scores")
        .select(SCORE_COLUMNS)
        .eq("slug", slug)
        .maybeSingle(),
      supabase
        .from("vouch_feed")
        .select("body, created_at, handle, display_name, role")
        .eq("slug", slug)
        .order("created_at", { ascending: false }),
      supabase
        .from("startup_scores")
        .select("slug", { count: "exact", head: true })
        .gt("score", 0),
    ]);

  const score = (scoreRow as Score) ?? EMPTY_SCORE(slug, card.name, card.tagline);
  const tier = tierOf(score.score);
  const feed = ((vouches as Vouch[]) ?? []).filter((v) => v.body.trim());
  const prompts = card.prompts ?? [];

  return (
    <>
      <div className="prof-head">
        <Logo name={card.name} src={card.logo_url} size={58} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1>{card.name}</h1>
          <div className="chips" style={{ marginTop: 8 }}>
            {card.tags.map((t) => (
              <i className="chip" key={t}>
                {t}
              </i>
            ))}
            <i className="chip">{SOURCE_LABEL[card.source]}</i>
            {card.batch && <i className="chip">{card.batch}</i>}
          </div>
          <p className="about">{card.tagline}</p>
          {card.website && (
            <p className="byline">
              <a href={card.website} target="_blank" rel="noopener noreferrer">
                {card.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            </p>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 26 }}>
        <h3>
          Status
          <span className="grow">
            {score.score > 0 ? `${above ?? 0} companies on the board` : "Not on the board yet"}
          </span>
        </h3>
        <div className="stats" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <div>
            <b style={{ color: "var(--accent)" }}>{score.score}</b>
            <span>Score</span>
          </div>
          <div>
            <b>{score.rights}</b>
            <span>Right swipes</span>
          </div>
          <div>
            <b>{score.vouches}</b>
            <span>Vouches</span>
          </div>
          <div>
            <b style={{ fontSize: 13, paddingTop: 6 }}>
              <span className="tier" style={{ background: tier.bg, color: tier.fg }}>
                {tier.name}
              </span>
            </b>
            <span>Tier</span>
          </div>
        </div>
      </div>

      <p className="sect">The profile</p>
      <div className="panel" style={{ marginBottom: 26 }}>
        {prompts.length ? (
          <>
            <div style={{ padding: "4px 20px 18px" }}>
              {prompts.map((p) => (
                <div className="prompt" key={p.q}>
                  <q>{p.q}</q>
                  <p>{p.a}</p>
                </div>
              ))}
            </div>
            <div className="meta">
              {card.author_handle ? (
                <span>
                  Written by{" "}
                  <Link href={`/u/${card.author_handle}`} style={{ color: "var(--ink)" }}>
                    {card.author_name}
                  </Link>
                </span>
              ) : card.generated ? (
                <span>
                  Drafted from the company&rsquo;s own description
                  {card.thin && " — thin source material, worth a rewrite"}
                </span>
              ) : (
                <span>From the Founders Inc registry</span>
              )}
            </div>
          </>
        ) : (
          <div className="empty">
            {card.description ? (
              <p style={{ margin: "0 0 12px", color: "var(--ink-2)", lineHeight: 1.55 }}>
                {card.description}
              </p>
            ) : null}
            Nobody has written this profile yet.
          </div>
        )}
      </div>

      <p className="sect">
        {feed.length ? `${feed.length} vouched for this` : "Vouches"}
      </p>
      {feed.length ? (
        <div className="grid">
          {feed.map((v) => (
            <div className="entry" key={`${v.handle}-${v.created_at}`}>
              <div style={{ minWidth: 0 }}>
                <div className="quote">{v.body}</div>
                <div className="byline">
                  <Link href={`/u/${v.handle}`}>{v.display_name}</Link>
                  {v.role && <span>· {v.role}</span>}
                  <span>
                    ·{" "}
                    {new Date(v.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel">
          <div className="empty">
            No one has written a vouch for {card.name} yet. A vouch is one line
            with your name on it — the strongest thing you can give a founder
            here.
          </div>
        </div>
      )}
    </>
  );
}
