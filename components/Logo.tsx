import type { Startup } from "@/lib/startups";

/** The registry logo on its light tile — the same treatment f.inc uses,
 *  which keeps white-on-transparent marks legible in both themes. */
export function Logo({
  startup,
  size = 38,
}: {
  startup: Pick<Startup, "name" | "logo">;
  size?: 58 | 38 | 28;
}) {
  return (
    <span className={`lg lg-${size}`}>
      {startup.logo ? (
        <img src={startup.logo} alt="" />
      ) : (
        <i>{startup.name[0]}</i>
      )}
    </span>
  );
}
