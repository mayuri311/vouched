import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BY_SLUG } from "@/lib/startups";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return { title: `@${handle} · Vouched` };
}

export default async function ScoutPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle, display_name, bio, role, created_at")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();

  if (!profile) notFound();

  const [{ data: vouches }, { data: auth }] = await Promise.all([
    supabase
      .from("vouches")
      .select("slug, body, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),
    supabase.auth.getUser(),
  ]);

  const isMe = auth.user?.id === profile.id;
  const list = (vouches ?? []).filter((v) => BY_SLUG[v.slug]);

  return (
    <>
      <div className="prof-head">
        <span className="av">{profile.display_name[0].toUpperCase()}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1>{profile.display_name}</h1>
          <div className="handle">
            @{profile.handle}
            {profile.role && ` · ${profile.role}`}
          </div>
          {profile.bio && <p className="about">{profile.bio}</p>}
        </div>
        {isMe && (
          <Link className="btn ghost" href="/onboarding">
            Edit profile
          </Link>
        )}
      </div>

      <p className="sect">
        {list.length
          ? `Vouched for ${list.length}`
          : isMe
            ? "You have not vouched yet"
            : "No vouches yet"}
      </p>

      {list.length ? (
        <div className="grid">
          {list.map((v) => {
            const s = BY_SLUG[v.slug];
            return (
              <div className="entry" key={v.slug}>
                <Logo startup={s} size={38} />
                <div style={{ minWidth: 0 }}>
                  <h4>
                    <Link href={`/s/${s.slug}`}>{s.name}</Link>
                  </h4>
                  <div className="tag">{s.tagline}</div>
                  {v.body.trim() && <div className="quote">{v.body}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <div className="empty">
            {isMe ? (
              <>
                Swipe right on something you believe in and write one line
                about why. <Link href="/">Back to the deck</Link>.
              </>
            ) : (
              <>
                {profile.display_name} has not written a vouch yet.
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
