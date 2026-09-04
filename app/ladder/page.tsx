import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BY_SLUG, STARTUPS } from "@/lib/startups";
import { tierOf, type Score } from "@/lib/score";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ladder · Vouched" };

export default async function LadderPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("startup_scores")
    .select("slug, rights, lefts, vouches, score")
    .order("score", { ascending: false });

  const rows = ((data as Score[]) ?? [])
    .filter((r) => r.score > 0 && BY_SLUG[r.slug])
    .sort((a, b) => b.score - a.score || b.rights - a.rights);

  return (
    <>
      <h1 className="page-title">The ladder</h1>
      <p className="page-lede">
        Live standing for all {STARTUPS.length} Founders Inc companies. A
        right swipe is +1, a signed vouch is +3. Signal is the share of
        swipes that went right.
      </p>

      {rows.length === 0 ? (
        <div className="panel">
          <div className="empty">
            The board is empty, and that is on purpose — nothing here is
            seeded. The first swipe puts the first company on it.
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
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const s = BY_SLUG[r.slug];
                  const tier = tierOf(r.score);
                  const seen = r.rights + r.lefts;
                  return (
                    <tr key={r.slug}>
                      <td className="n">{i + 1}</td>
                      <td>
                        <Link className="co" href={`/s/${r.slug}`}>
                          <Logo startup={s} size={28} />
                          <span>
                            <b>{s.name}</b>
                            <br />
                            <em>{s.tagline}</em>
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
                      <td className="n">
                        {seen ? `${Math.round((r.rights / seen) * 100)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
