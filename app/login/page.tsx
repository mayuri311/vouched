"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const DOMAIN = "@andrew.cmu.edu";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();

    if (!address.endsWith(DOMAIN)) {
      setError(`Vouched is open to ${DOMAIN} addresses only.`);
      return;
    }

    setError("");
    setState("sending");

    const { error } = await createClient().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setState("idle");
      return;
    }

    setState("sent");
  }

  return (
    <div className="narrow">
      <h1 className="page-title">Sign in to vouch</h1>
      <p className="page-lede">
        The ladder is public and anyone can read it. Moving it takes a
        verified <span className="mono">{DOMAIN}</span> address, so every
        vouch on this site has a real person behind it.
      </p>

      {state === "sent" ? (
        <div className="panel">
          <div className="empty">
            <p className="note-ok" style={{ margin: 0 }}>
              Check <b>{email.trim().toLowerCase()}</b> for a sign-in link.
            </p>
            <p style={{ margin: "10px 0 0" }}>
              The link opens Vouched and signs you in. It expires in an hour
              and works once.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={send}>
          {error && <p className="err">{error}</p>}
          <label className="field">
            <span>Andrew email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`you${DOMAIN}`}
              autoComplete="email"
              required
            />
            <span className="help">
              We send a one-time link. No password to set or forget.
            </span>
          </label>
          <button className="btn" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Email me a link"}
          </button>
        </form>
      )}
    </div>
  );
}
