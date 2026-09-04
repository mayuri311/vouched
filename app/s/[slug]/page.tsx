import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BY_SLUG, STARTUPS } from "@/lib/startups";
import { EMPTY_SCORE, tierOf, type Score } from "@/lib/score";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = BY_SLUG[slug];
  return s
    ? { title: `${s.name} · Vouched`, description: s.tagline }
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
  const startup = BY_SLUG[slug];
  if (!startup) notFound();

  const supabase = await createClient();
  const [{ data: scoreRow }, { data: vouches }] = await Promise.all([
    supabase
      .from("startup_scores")
      .select("slug, rights, lefts, vouches, score")
      .eq("slug", slug)
      .maybeSingle(),
    supabase
      .from("vouch_feed")
      .select("body, created_at, handle, display_name, role")
      .eq("slug", slug)
      .order("created_at", { ascending: false }),
  ]);

  const score = (scoreRow as Score) ?? EMPTY_SCORE(slug);
  const tier = tierOf(score.score);
  const feed = ((vouches as Vouch[]) ?? []).filter((v) => v.body.trim());
  const rank =
    STARTUPS.length && score.score > 0
      ? await rankOf(supabase, score.score)
      : null;

  return (
    <>
      <div className="prof-head">
        <Logo startup={startup} size={58} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1>{startup.name}</h1>
          <div className="chips" style={{ marginTop: 8 }}>
            {(startup.tags.length ? startup.tags : ["Founders Inc"]).map((t) => (
              <i className="chip" key={t}>
                {t}
              </i>
            ))}
          </div>
          <p className="about">{startup.tagline}</p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 26 }}>
        <h3>
          Status
          <span className="grow">
            {rank ? `#${rank} on the ladder` : "Not on the board yet"}
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
        <div style={{ padding: "4px 20px 18px" }}>
          {startup.prompts.map((p) => (
            <div className="prompt" key={p.q}>
              <q>{p.q}</q>
              <p>{p.a}</p>
            </div>
          ))}
        </div>
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
            No one has written a vouch for {startup.name} yet. A vouch is one
            line with your name on it — it is the strongest thing you can give
            a founder here.
          </div>
        </div>
      )}
    </>
  );
}

/** How many companies sit strictly above this score. */
async function rankOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  score: number,
) {
  const { count } = await supabase
    .from("startup_scores")
    .select("slug", { count: "exact", head: true })
    .gt("score", score);
  return (count ?? 0) + 1;
}
