import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vouched",
  description:
    "Swipe through the Founders Inc portfolio. Right swipes and signed vouches build each startup's public status.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let handle: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("handle")
      .eq("id", user.id)
      .maybeSingle();
    handle = data?.handle ?? null;
  }

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600&family=Instrument+Sans:ital,wght@0,400..700;1,400..600&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <div className="wrap">
          <Nav handle={handle} />
          {children}
        </div>
      </body>
    </html>
  );
}
