import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scouts · Vouched" };

type Scout = {
  handle: string;
  display_name: string;
  role: string;
  bio: string;
  rights: number;
  vouches: number;
};

export default async function ScoutsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("scout_stats")
    .select("handle, display_name, role, bio, rights, vouches")
    .order("vouches", { ascending: false });

  const scouts = (data as Scout[]) ?? [];

  return (
    <>
      <h1 className="page-title">Scouts</h1>
      <p className="page-lede">
        Everyone building status here, with an @andrew.cmu.edu address behind
        the name. Ranked by vouches written, because that is the part that
        costs something.
      </p>

      {scouts.length === 0 ? (
        <div className="panel">
          <div className="empty">
            No one has signed up yet. <Link href="/login">Be the first.</Link>
          </div>
        </div>
      ) : (
        <div className="grid">
          {scouts.map((s) => (
            <div className="entry" key={s.handle}>
              <span className="av" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 17 }}>
                {s.display_name[0].toUpperCase()}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h4>
                  <Link href={`/u/${s.handle}`}>{s.display_name}</Link>
                </h4>
                <div className="tag">
                  @{s.handle}
                  {s.role && ` · ${s.role}`}
                </div>
                {s.bio && (
                  <div className="tag" style={{ marginTop: 6, color: "var(--ink-2)" }}>
                    {s.bio}
                  </div>
                )}
                <div className="byline">
                  <span className="mono">{s.vouches} vouches</span>
                  <span>·</span>
                  <span className="mono">{s.rights} right swipes</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
