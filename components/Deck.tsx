"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { STARTUPS, type Startup } from "@/lib/startups";
import { EMPTY_SCORE, tierOf, type Score } from "@/lib/score";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "./Logo";

type Props = {
  userId: string;
  initialScores: Score[];
  mySwipes: Record<string, number>;
  myVouches: Record<string, string>;
};

const shuffle = <T,>(a: T[]) => {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export function Deck({ userId, initialScores, mySwipes, myVouches }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [scores, setScores] = useState<Record<string, Score>>(() =>
    Object.fromEntries(initialScores.map((s) => [s.slug, s])),
  );
  const [swipes, setSwipes] = useState(mySwipes);
  const [vouches, setVouches] = useState(myVouches);

  const [deck, setDeck] = useState<Startup[]>(() =>
    shuffle(STARTUPS.filter((s) => !(s.slug in mySwipes))),
  );
  const [idx, setIdx] = useState(0);
  const [sheetFor, setSheetFor] = useState<Startup | null>(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");

  const scoreOf = useCallback(
    (slug: string) => scores[slug] ?? EMPTY_SCORE(slug),
    [scores],
  );

  /* Someone else's swipe should show up here without a reload. */
  const refreshScores = useCallback(async () => {
    const { data } = await supabase
      .from("startup_scores")
      .select("slug, rights, lefts, vouches, score");
    if (data) {
      setScores(Object.fromEntries(data.map((s) => [s.slug, s as Score])));
    }
  }, [supabase]);

  useEffect(() => {
    const timer = setInterval(refreshScores, 25_000);
    const onFocus = () => refreshScores();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshScores]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const current = deck[idx];

  useEffect(() => {
    if (sheetFor) setTimeout(() => noteRef.current?.focus(), 340);
  }, [sheetFor]);

  const bump = useCallback((slug: string, dir: number, vouched = false) => {
    setScores((prev) => {
      const at = prev[slug] ?? EMPTY_SCORE(slug);
      const next: Score = {
        ...at,
        rights: at.rights + (dir > 0 ? 1 : 0),
        lefts: at.lefts + (dir < 0 ? 1 : 0),
        vouches: at.vouches + (vouched ? 1 : 0),
        score: at.score + (dir > 0 ? 1 : 0) + (vouched ? 3 : 0),
      };
      return { ...prev, [slug]: next };
    });
  }, []);

  const commit = useCallback(
    async (startup: Startup, dir: number) => {
      setSwipes((p) => ({ ...p, [startup.slug]: dir }));
      bump(startup.slug, dir);
      const { error } = await supabase
        .from("swipes")
        .upsert({ user_id: userId, slug: startup.slug, dir });
      if (error) setToast("Could not save that swipe — check your connection");
      else if (dir > 0) setSheetFor(startup);
    },
    [bump, supabase, userId],
  );

  async function sendVouch() {
    const startup = sheetFor;
    if (!startup) return;
    const body = note.trim();

    setVouches((p) => ({ ...p, [startup.slug]: body }));
    bump(startup.slug, 0, true);
    setSheetFor(null);
    setNote("");

    const { error } = await supabase
      .from("vouches")
      .upsert({ user_id: userId, slug: startup.slug, body });

    if (error) {
      setToast("Could not save that vouch — try again");
      return;
    }
    const after = (scoreOf(startup.slug).score ?? 0) + 3;
    setToast(`${startup.name} → ${tierOf(after).name.toUpperCase()}`);
  }

  /* ── drag ─────────────────────────────────────────────────── */
  const cardRef = useRef<HTMLElement | null>(null);
  const noteRef = useRef<HTMLInputElement | null>(null);
  const drag = useRef({ x: 0, y: 0, dx: 0, on: false, moved: false });

  const stamps = (el: HTMLElement) => ({
    yes: el.querySelector<HTMLElement>(".stamp.yes"),
    no: el.querySelector<HTMLElement>(".stamp.no"),
  });

  const fly = useCallback(
    (dir: number) => {
      const el = cardRef.current;
      const startup = deck[idx];
      if (!el || !startup) return;

      el.classList.add("anim");
      el.style.transform = `translate(${dir * window.innerWidth}px, 60px) rotate(${dir * 22}deg)`;
      el.style.opacity = "0";
      const s = stamps(el);
      const shown = dir > 0 ? s.yes : s.no;
      if (shown) shown.style.opacity = "1";

      void commit(startup, dir);
      setTimeout(() => setIdx((i) => i + 1), 240);
    },
    [commit, deck, idx],
  );

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest("button, a")) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, on: true, moved: false };
    e.currentTarget.classList.add("drag");
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d.on) return;
    d.dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(d.dx) > 4) d.moved = true;

    const el = e.currentTarget;
    el.style.transform = `translate(${d.dx}px, ${dy * 0.35}px) rotate(${d.dx * 0.045}deg)`;
    const s = stamps(el);
    if (s.yes) s.yes.style.opacity = String(Math.max(0, Math.min(1, d.dx / 95)));
    if (s.no) s.no.style.opacity = String(Math.max(0, Math.min(1, -d.dx / 95)));
  }

  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d.on) return;
    d.on = false;
    const el = e.currentTarget;
    el.classList.remove("drag");

    if (d.moved && Math.abs(d.dx) > 105) {
      fly(d.dx > 0 ? 1 : -1);
      return;
    }
    el.classList.add("anim");
    el.style.transform = "";
    const s = stamps(el);
    if (s.yes) s.yes.style.opacity = "0";
    if (s.no) s.no.style.opacity = "0";
    setTimeout(() => el.classList.remove("anim"), 430);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") setSheetFor(null);
        return;
      }
      if (e.key === "ArrowRight") fly(1);
      if (e.key === "ArrowLeft") fly(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fly]);

  /* ── derived ──────────────────────────────────────────────── */
  const ladder = useMemo(
    () =>
      STARTUPS.map((s) => ({ s, sc: scoreOf(s.slug) }))
        .filter((r) => r.sc.score > 0)
        .sort(
          (a, b) =>
            b.sc.score - a.sc.score ||
            b.sc.rights - a.sc.rights ||
            a.s.name.localeCompare(b.s.name),
        )
        .slice(0, 10),
    [scoreOf],
  );

  const rights = Object.values(swipes).filter((d) => d > 0).length;

  return (
    <>
      <div className="cols">
        <div>
          <div className="stage">
            {current ? (
              deck
                .slice(idx, idx + 3)
                .map((s, depth) => {
                  const sc = scoreOf(s.slug);
                  const tier = tierOf(sc.score);
                  return (
                    <article
                      key={s.slug}
                      ref={depth === 0 ? (el) => { cardRef.current = el; } : undefined}
                      className={`card${depth === 0 ? " is-top" : ""}`}
                      style={
                        depth
                          ? {
                              transform: `translateY(${depth * 11}px) scaleX(${1 - depth * 0.045})`,
                              opacity: 1 - depth * 0.1,
                            }
                          : { transform: "", opacity: 1 }
                      }
                      onPointerDown={depth === 0 ? onPointerDown : undefined}
                      onPointerMove={depth === 0 ? onPointerMove : undefined}
                      onPointerUp={depth === 0 ? onPointerUp : undefined}
                      onPointerCancel={depth === 0 ? onPointerUp : undefined}
                    >
                      <div className="body">
                        <div className="ident">
                          <Logo startup={s} size={58} />
                          <div>
                            <h2>{s.name}</h2>
                            <div className="chips">
                              {(s.tags.length ? s.tags : ["Founders Inc"]).map(
                                (t) => (
                                  <i className="chip" key={t}>
                                    {t}
                                  </i>
                                ),
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="bio">{s.tagline}</p>
                        {s.prompts.map((p) => (
                          <div className="prompt" key={p.q}>
                            <q>{p.q}</q>
                            <p>{p.a}</p>
                          </div>
                        ))}
                      </div>
                      <div className="meta">
                        <span
                          className="tier"
                          style={{ background: tier.bg, color: tier.fg }}
                        >
                          {tier.name}
                        </span>
                        <span>{sc.score} status</span>
                        <span className="grow">
                          {sc.vouches} vouched · {sc.rights} right
                        </span>
                      </div>
                      <div className="stamp yes">VOUCHED</div>
                      <div className="stamp no">PASS</div>
                    </article>
                  );
                })
                .reverse()
            ) : (
              <div className="card is-top">
                <div className="done">
                  <h3>That&rsquo;s the whole registry.</h3>
                  <p>
                    You went through all {STARTUPS.length} Founders Inc
                    companies. The ladder keeps everything you built.
                  </p>
                  <Link className="btn" href="/ladder">
                    See where they landed
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="actions">
            <button
              className="act no"
              onClick={() => fly(-1)}
              disabled={!current}
              aria-label="Pass"
              title="Pass (←)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
            <button
              className="act yes"
              onClick={() => fly(1)}
              disabled={!current}
              aria-label="Swipe right and vouch"
              title="Swipe right (→)"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21s-8.5-5.4-8.5-11A4.8 4.8 0 0 1 12 7.2 4.8 4.8 0 0 1 20.5 10c0 5.6-8.5 11-8.5 11z" />
              </svg>
            </button>
          </div>
          <p className="hint">
            <kbd>←</kbd> pass &nbsp;·&nbsp; <kbd>→</kbd> swipe right
            &nbsp;·&nbsp; drag the card
          </p>
        </div>

        <aside className="rail">
          <div className="panel">
            <h3>
              Your run
              <span className="grow">{Math.max(deck.length - idx, 0)} left</span>
            </h3>
            <div className="stats">
              <div>
                <b>{rights}</b>
                <span>Right</span>
              </div>
              <div>
                <b>{Object.keys(vouches).length}</b>
                <span>Vouches</span>
              </div>
              <div>
                <b>{Object.keys(swipes).length}</b>
                <span>Seen</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3>
              The ladder
              <Link href="/ladder" className="grow" style={{ color: "var(--accent)" }}>
                All
              </Link>
            </h3>
            {ladder.length ? (
              <ol className="lad">
                {ladder.map((r, i) => (
                  <li key={r.s.slug} className={swipes[r.s.slug] > 0 ? "mine" : ""}>
                    <span className="rk">{i + 1}</span>
                    <Logo startup={r.s} size={28} />
                    <Link className="nm" href={`/s/${r.s.slug}`}>
                      {r.s.name}
                    </Link>
                    <span
                      className="sc"
                      style={{ color: r.sc.score >= 5 ? "var(--accent)" : "var(--ink)" }}
                    >
                      {r.sc.score}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty">
                Nothing on the board yet. A right swipe is +1, a signed vouch
                is +3.
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className={`sheet${sheetFor ? " open" : ""}`}>
        <h4>Vouch for {sheetFor?.name ?? ""}</h4>
        <div className="sub">{sheetFor?.tagline ?? ""}</div>
        <div className="row">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendVouch()}
            maxLength={140}
            placeholder={"I\u2019d use this tomorrow because\u2026"}
            ref={noteRef}
          />
          <button className="btn" onClick={sendVouch}>
            Vouch
          </button>
          <button className="btn ghost" onClick={() => setSheetFor(null)}>
            Skip
          </button>
        </div>
      </div>

      <div className={`toast${toast ? " on" : ""}`}>{toast}</div>
    </>
  );
}
