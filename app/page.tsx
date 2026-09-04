import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BY_SLUG, STARTUPS } from "@/lib/startups";
import { tierOf, type Score } from "@/lib/score";
import { Deck } from "@/components/Deck";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: scores } = await supabase
    .from("startup_scores")
    .select("slug, rights, lefts, vouches, score");

  if (!user) return <Landing scores={(scores as Score[]) ?? []} />;

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/onboarding");

  const [{ data: swipes }, { data: vouches }] = await Promise.all([
    supabase.from("swipes").select("slug, dir"),
    supabase.from("vouches").select("slug, body"),
  ]);

  return (
    <Deck
      userId={user.id}
      initialScores={(scores as Score[]) ?? []}
      mySwipes={Object.fromEntries((swipes ?? []).map((s) => [s.slug, s.dir]))}
      myVouches={Object.fromEntries((vouches ?? []).map((v) => [v.slug, v.body]))}
    />
  );
}

function Landing({ scores }: { scores: Score[] }) {
  const top = scores
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.rights - a.rights)
    .slice(0, 5);

  return (
    <>
      <section className="hero">
        <h1>
          {STARTUPS.length} startups wrote a <em>dating profile</em>.
        </h1>
        <p>
          Every company in the Founders Inc portfolio, answering Hinge
          prompts. Swipe through them. When one is genuinely good, vouch for
          it with your name on the line — and watch a founder&rsquo;s status
          climb because of you.
        </p>
        <Link className="btn" href="/login">
          Sign in with Andrew email
        </Link>
        <p className="hint" style={{ marginTop: 14 }}>
          Reading the ladder needs no account
        </p>
      </section>

      <div className="steps">
        <div>
          <span className="no">RIGHT SWIPE · +1</span>
          <h4>Say you like it</h4>
          <p>
            Cheap, fast, anonymous in the aggregate. Nobody sees which way you
            swiped — only the totals move.
          </p>
        </div>
        <div>
          <span className="no">VOUCH · +3</span>
          <h4>Say why, publicly</h4>
          <p>
            One line, signed with your name and handle. It goes on the
            company&rsquo;s page and stays there. This is the real currency.
          </p>
        </div>
        <div>
          <span className="no">STATUS</span>
          <h4>Founders get a ladder</h4>
          <p>
            Unlisted, Noticed, Warm, Buzzing, Hot, Legend. Public, live, and
            starting from a genuine zero.
          </p>
        </div>
      </div>

      <p className="sect">
        {top.length ? "Leading the ladder right now" : "The ladder"}
      </p>
      <div className="panel">
        {top.length ? (
          <ol className="lad" style={{ padding: 8 }}>
            {top.map((s, i) => {
              const startup = BY_SLUG[s.slug];
              if (!startup) return null;
              return (
                <li key={s.slug}>
                  <span className="rk">{i + 1}</span>
                  <Logo startup={startup} size={28} />
                  <Link className="nm" href={`/s/${s.slug}`}>
                    {startup.name}
                  </Link>
                  <span className="tier" style={{ background: tierOf(s.score).bg, color: tierOf(s.score).fg }}>
                    {tierOf(s.score).name}
                  </span>
                  <span className="sc" style={{ color: "var(--accent)" }}>
                    {s.score}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="empty">
            Nobody has swiped yet — the board starts at a real zero. Sign in
            and you will be the first name on it.
          </div>
        )}
      </div>
    </>
  );
}
