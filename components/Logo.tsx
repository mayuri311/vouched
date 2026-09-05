/** The registry mark on its light tile — the treatment f.inc uses, which
 *  keeps white-on-transparent logos legible in both themes. `src` is
 *  either a local /logos/*.webp path or a remote URL from an ingest. */
export function Logo({
  name,
  src,
  size = 38,
}: {
  name: string;
  src?: string | null;
  size?: 58 | 38 | 28;
}) {
  return (
    <span className={`lg lg-${size}`}>
      {src ? <img src={src} alt="" loading="lazy" /> : <i>{name[0]}</i>}
    </span>
  );
}
