"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CARD_COLUMNS,
  PAGE_SIZE,
  SOURCE_LABEL,
  TOP_UP_AT,
  type Card,
} from "@/lib/registry";
import { EMPTY_SCORE, SCORE_COLUMNS, tierOf, type Score } from "@/lib/score";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "./Logo";

type Props = {
  userId: string;
  initialCards: Card[];
  initialScores: Score[];
  registrySize: number;
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

export function Deck({
  userId,
  initialCards,
  initialScores,
  registrySize,
  mySwipes,
  myVouches,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [scores, setScores] = useState<Record<string, Score>>(() =>
    Object.fromEntries(initialScores.map((s) => [s.slug, s])),
  );
  const [swipes, setSwipes] = useState(mySwipes);
  const [vouches, setVouches] = useState(myVouches);

  const [deck, setDeck] = useState<Card[]>(() => shuffle(initialCards));
  const [idx, setIdx] = useState(0);
  const [exhausted, setExhausted] = useState(initialCards.length < PAGE_SIZE);
  const nextPage = useRef(1);
  const loading = useRef(false);

  const [sheetFor, setSheetFor] = useState<Card | null>(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");

  const scoreOf = useCallback(
    (slug: string) => scores[slug] ?? EMPTY_SCORE(slug),
    [scores],
  );

  /* ── paging ───────────────────────────────────────────────── */
  // Everything already dealt or already swiped. Kept in a ref so fetching
  // does not depend on swipe state and re-create itself on every card.
  const seen = useRef(
    new Set([...initialCards.map((c) => c.slug), ...Object.keys(mySwipes)]),
  );

  const loadMore = useCallback(async () => {
    if (loading.current || exhausted) return;
    loading.current = true;

    // A whole page can be cards this person already swiped, which would
    // leave the deck short and the top-up effect with nothing to react to.
    // Keep pulling pages until one yields something new.
    try {
      while (true) {
        const from = nextPage.current * PAGE_SIZE;
        const { data, error } = await supabase
          .from("deck_cards")
          .select(CARD_COLUMNS)
          .order("listed_at", { ascending: false })
          .order("slug", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error || !data || data.length === 0) {
          setExhausted(true);
          return;
        }

        nextPage.current += 1;
        const lastPage = data.length < PAGE_SIZE;

        const fresh = ((data as unknown) as Card[]).filter(
          (c) => !seen.current.has(c.slug),
        );
        fresh.forEach((c) => seen.current.add(c.slug));

        if (fresh.length) {
          setDeck((d) => [...d, ...shuffle(fresh)]);
          if (lastPage) setExhausted(true);
          return;
        }
        if (lastPage) {
          setExhausted(true);
          return;
        }
      }
    } finally {
      loading.current = false;
    }
  }, [exhausted, supabase, mySwipes]);

  useEffect(() => {
    if (deck.length - idx <= TOP_UP_AT) void loadMore();
  }, [deck.length, idx, loadMore]);

  /* ── live scores ──────────────────────────────────────────── */
  const refreshScores = useCallback(async () => {
    const { data } = await supabase
      .from("startup_scores")
      .select(SCORE_COLUMNS);
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

  const noteRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (sheetFor) setTimeout(() => noteRef.current?.focus(), 340);
  }, [sheetFor]);

  const bump = useCallback((slug: string, dir: number, vouched = false) => {
    setScores((prev) => {
      const at = prev[slug] ?? EMPTY_SCORE(slug);
      return {
        ...prev,
        [slug]: {
          ...at,
          rights: at.rights + (dir > 0 ? 1 : 0),
          lefts: at.lefts + (dir < 0 ? 1 : 0),
          vouches: at.vouches + (vouched ? 1 : 0),
          score: at.score + (dir > 0 ? 1 : 0) + (vouched ? 3 : 0),
        },
      };
    });
  }, []);

  const commit = useCallback(
    async (card: Card, dir: number) => {
      setSwipes((p) => ({ ...p, [card.slug]: dir }));
      seen.current.add(card.slug);
      bump(card.slug, dir);
      const { error } = await supabase
        .from("swipes")
        .upsert({ user_id: userId, slug: card.slug, dir });
      if (error) setToast("Could not save that swipe — check your connection");
      else if (dir > 0) setSheetFor(card);
    },
    [bump, supabase, userId],
  );

  async function sendVouch() {
    const card = sheetFor;
    if (!card) return;
    const body = note.trim();

    setVouches((p) => ({ ...p, [card.slug]: body }));
    bump(card.slug, 0, true);
    setSheetFor(null);
    setNote("");

    const { error } = await supabase
      .from("vouches")
      .upsert({ user_id: userId, slug: card.slug, body });

    if (error) {
      setToast("Could not save that vouch — try again");
      return;
    }
    setToast(
      `${card.name} → ${tierOf(scoreOf(card.slug).score + 3).name.toUpperCase()}`,
    );
  }

  /* ── drag ─────────────────────────────────────────────────── */
  const cardRef = useRef<HTMLElement | null>(null);
  const drag = useRef({ x: 0, y: 0, dx: 0, on: false, moved: false });

  const stamps = (el: HTMLElement) => ({
    yes: el.querySelector<HTMLElement>(".stamp.yes"),
    no: el.querySelector<HTMLElement>(".stamp.no"),
  });

  const fly = useCallback(
    (dir: number) => {
      const el = cardRef.current;
      const card = deck[idx];
      if (!el || !card) return;

      el.classList.add("anim");
      el.style.transform = `translate(${dir * window.innerWidth}px, 60px) rotate(${dir * 22}deg)`;
      el.style.opacity = "0";
      const shown = dir > 0 ? stamps(el).yes : stamps(el).no;
      if (shown) shown.style.opacity = "1";

      void commit(card, dir);
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
      Object.values(scores)
        .filter((s) => s.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score || b.rights - a.rights || a.name.localeCompare(b.name),
        )
        .slice(0, 10),
    [scores],
  );

  const rights = Object.values(swipes).filter((d) => d > 0).length;
  const left = Math.max(deck.length - idx, 0);

  return (
    <>
      <div className="cols">
        <div>
          <div className="stage">
            {current ? (
              deck
                .slice(idx, idx + 3)
                .map((card, depth) => {
                  const sc = scoreOf(card.slug);
                  const tier = tierOf(sc.score);
                  const prompts = card.prompts ?? [];
                  return (
                    <article
                      key={card.slug}
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
                          <Logo name={card.name} src={card.logo_url} size={58} />
                          <div>
                            <h2>{card.name}</h2>
                            <div className="chips">
                              {(card.tags.length
                                ? card.tags
                                : [SOURCE_LABEL[card.source]]
                              )
                                .slice(0, 4)
                                .map((t) => (
                                  <i className="chip" key={t}>
                                    {t}
                                  </i>
                                ))}
                            </div>
                          </div>
                        </div>
                        <p className="bio">{card.tagline}</p>

                        {prompts.length ? (
                          prompts.map((p) => (
                            <div className="prompt" key={p.q}>
                              <q>{p.q}</q>
                              <p>{p.a}</p>
                            </div>
                          ))
                        ) : (
                          <div className="unwritten">
                            {card.description && <p>{card.description}</p>}
                            <Link href={`/s/${card.slug}`}>
                              Nobody has written this profile yet →
                            </Link>
                          </div>
                        )}
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
                  <h3>
                    {exhausted
                      ? "That’s the whole registry."
                      : "Loading more…"}
                  </h3>
                  <p>
                    {exhausted
                      ? `You went through all ${registrySize} companies. New ones keep arriving — the ladder keeps everything you built.`
                      : "Pulling the next batch of companies."}
                  </p>
                  {exhausted && (
                    <Link className="btn" href="/ladder">
                      See where they landed
                    </Link>
                  )}
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
              <span className="grow">{left} left</span>
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
                {ladder.map((s, i) => (
                  <li key={s.slug} className={swipes[s.slug] > 0 ? "mine" : ""}>
                    <span className="rk">{i + 1}</span>
                    <Logo name={s.name} src={null} size={28} />
                    <Link className="nm" href={`/s/${s.slug}`}>
                      {s.name}
                    </Link>
                    <span
                      className="sc"
                      style={{ color: s.score >= 5 ? "var(--accent)" : "var(--ink)" }}
                    >
                      {s.score}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty">
                Nothing on the board yet. A right swipe is +1, a signed vouch is
                +3.
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
            ref={noteRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendVouch()}
            maxLength={140}
            placeholder={"I’d use this tomorrow because…"}
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
