"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  handle: string;
  display_name: string;
  bio: string;
  role: string;
};

export function OnboardingForm({
  email,
  suggested,
  existing,
}: {
  email: string;
  suggested: string;
  existing: Profile | null;
}) {
  const router = useRouter();
  const editing = existing !== null;

  const [handle, setHandle] = useState(existing?.handle ?? suggested);
  const [name, setName] = useState(existing?.display_name ?? "");
  const [role, setRole] = useState(existing?.role ?? "");
  const [bio, setBio] = useState(existing?.bio ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const clean = handle.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,20}$/.test(clean)) {
      setError(
        "Handles are 2–20 characters, using lowercase letters, numbers, or underscores.",
      );
      return;
    }
    if (!name.trim()) {
      setError("Add the name you want on your vouches.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      handle: clean,
      display_name: name.trim(),
      role: role.trim(),
      bio: bio.trim(),
    });

    if (error) {
      setError(
        error.code === "23505"
          ? `@${clean} is taken. Try another handle.`
          : error.message,
      );
      setSaving(false);
      return;
    }

    router.push(editing ? `/u/${clean}` : "/");
    router.refresh();
  }

  return (
    <div className="narrow">
      <h1 className="page-title">
        {editing ? "Edit your profile" : "Set up your profile"}
      </h1>
      <p className="page-lede">
        Signed in as <span className="mono">{email}</span>. This is what
        founders see next to every vouch you leave, so it is worth a real
        sentence.
      </p>

      <form onSubmit={save}>
        {error && <p className="err">{error}</p>}

        <label className="field">
          <span>Handle</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={20}
            required
          />
          <span className="help">
            Your public page lives at /u/{handle.trim().toLowerCase() || "…"}
          </span>
        </label>

        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mayuri Murugan"
            maxLength={40}
            required
          />
        </label>

        <label className="field">
          <span>What you do</span>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="CS @ CMU · robotics"
            maxLength={60}
          />
          <span className="help">
            Shown under your name. It is why a founder trusts your vouch.
          </span>
        </label>

        <label className="field">
          <span>Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={240}
            placeholder="What you know well, and what you would actually be useful for."
          />
          <span className="help">{240 - bio.length} characters left</span>
        </label>

        <button className="btn" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save profile" : "Start swiping"}
        </button>
      </form>
    </div>
  );
}
