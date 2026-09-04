"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function Nav({ handle }: { handle: string | null }) {
  const path = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const on = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);

  return (
    <header className="top">
      <Link href="/" className="mark">
        <b>Vouched</b>
        <i className="dot" />
        <small>Founders&nbsp;Inc&nbsp;registry</small>
      </Link>

      <nav className="navlinks">
        <Link href="/" className={on("/") ? "on" : ""}>Deck</Link>
        <Link href="/ladder" className={on("/ladder") ? "on" : ""}>Ladder</Link>
        <Link href="/scouts" className={on("/scouts") ? "on" : ""}>Scouts</Link>
      </nav>

      <div className="who">
        {handle ? (
          <>
            <Link href={`/u/${handle}`}>@{handle}</Link>
            <span aria-hidden>·</span>
            <button onClick={signOut}>Sign out</button>
          </>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </div>
    </header>
  );
}
