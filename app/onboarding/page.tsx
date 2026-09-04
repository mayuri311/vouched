import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, display_name, bio, role")
    .eq("id", user.id)
    .maybeSingle();

  const suggested =
    (user.email ?? "").split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "") ||
    "scout";

  return (
    <OnboardingForm
      email={user.email ?? ""}
      suggested={suggested}
      existing={profile ?? null}
    />
  );
}
