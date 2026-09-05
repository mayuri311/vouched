import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SCORE_COLUMNS, tierOf, type Score } from "@/lib/score";
import { SOURCE_LABEL, type Source } from "@/lib/registry";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ladder · Vouched" };

type Rising = {
  slug: string;
  name: string;
  tagline: string;
  source: Source;
  rights: number;
  vouches: number;
  score: number;
};

export default async function LadderPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const rising = view === "rising";
  const supabase = await createClient();

  const [{ data: all }, { data: hot }, { count: registrySize }] =
    await Promise.all([
      supabase.from("startup_scores").select(SCORE_COLUMNS).order("score", { ascending: false }),
      supabase
        .from("startup_rising")
        .select("slug, name, tagline, source, rights, vouches, score")
        .order("score", { ascending: false })
        .limit(50),
      supabase.from("startups").select("slug", { count: "exact", head: true }),
    ]);

  const allTime = ((all as Score[]) ?? [])
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.rights - a.rights);
  const risingRows = ((hot as Rising[]) ?? []).filter((r) => r.score > 0);
  const rows = rising ? risingRows : allTime;
  const logos = new Map(((all as Score[]) ?? []).map((s) => [s.slug, s.logo_url]));

  return (
    <>
      <h1 className="page-title">The ladder</h1>
      <p className="page-lede">
        Live standing across all {registrySize ?? 0} companies in the registry. A
        right swipe is +1, a signed vouch is +3.{" "}
        {rising
          ? "Rising counts only the last seven days, so new arrivals are not buried under a head start."
          : "Signal is the share of swipes that went right."}
      </p>

      <nav className="navlinks" style={{ display: "inline-flex", marginBottom: 20 }}>
        <Link href="/ladder" className={rising ? "" : "on"}>
          All time
        </Link>
        <Link href="/ladder?view=rising" className={rising ? "on" : ""}>
          Rising · 7 days
        </Link>
      </nav>

      {rows.length === 0 ? (
        <div className="panel">
          <div className="empty">
            {rising
              ? "Nothing has moved in the last seven days."
              : "The board is empty, and that is on purpose — nothing here is seeded. The first swipe puts the first company on it."}
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="scroller">
            <table className="board">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Right</th>
                  <th>Vouches</th>
                  {!rising && <th>Signal</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const tier = tierOf(r.score);
                  const seen = "lefts" in r ? r.rights + (r as Score).lefts : 0;
                  return (
                    <tr key={r.slug}>
                      <td className="n">{i + 1}</td>
                      <td>
                        <Link className="co" href={`/s/${r.slug}`}>
                          <Logo name={r.name} src={logos.get(r.slug) ?? null} size={28} />
                          <span>
                            <b>{r.name}</b>
                            <br />
                            <em>{r.tagline}</em>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className="tier" style={{ background: tier.bg, color: tier.fg }}>
                          {tier.name}
                        </span>
                      </td>
                      <td className="n">{r.score}</td>
                      <td className="n">{r.rights}</td>
                      <td className="n">{r.vouches}</td>
                      {!rising && (
                        <td className="n">
                          {seen ? `${Math.round((r.rights / seen) * 100)}%` : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="hint" style={{ marginTop: 18, textAlign: "left" }}>
        Sources: {Object.values(SOURCE_LABEL).join(" · ")}
      </p>
    </>
  );
}
