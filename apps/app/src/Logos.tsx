// The Google "G" (as Google's sign-in guidelines ask), the four sources' own marks and the radar's source tags.
import { SOURCE_IDS, SOURCE_LOGOS, SOURCE_STYLE, SOURCES } from "@skillab/research";

export function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** One source's own mark (Y Combinator for Hacker News, arXiv, Hugging Face, GitHub), the same as on the landing. */
export function SourceMark({ id, size = 18 }: { id: string; size?: number }) {
  const l = (SOURCE_LOGOS as Record<string, { name: string; path: string; color: string }>)[id];
  if (!l) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={l.name}>
      <path fill={l.color} d={l.path} {...(id === "huggingface" ? { stroke: "#3a2f00", strokeWidth: 0.35 } : {})} />
    </svg>
  );
}
/** Hacker News: Y Combinator's mark. */
export const HnMark = ({ size = 18 }: { size?: number }) => <SourceMark id="hackernews" size={size} />;

/** A small tag for where a radar item came from: its logo and its name. */
export function SourceTag({ source }: { source?: string | null }) {
  const id = (source && source in SOURCE_STYLE ? source : "hackernews") as keyof typeof SOURCE_STYLE;
  const st = SOURCE_STYLE[id];
  return (
    <span className="srctag" style={{ ["--c" as string]: st.color }} title={SOURCES[id].name}>
      <SourceMark id={id} size={12} /> {st.short}
    </span>
  );
}

/** Its four sources at once, each with its own mark. */
export function SourcesMark({ size = 18 }: { size?: number }) {
  return (
    <span className="srcmark" role="img" aria-label={SOURCE_IDS.map((i) => SOURCES[i].name).join(", ")}>
      {SOURCE_IDS.map((id) => <SourceMark key={id} id={id} size={size} />)}
    </span>
  );
}

export function MetaMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="Meta">
      <path fill="#0081fb" d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z" />
    </svg>
  );
}

export function Check({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
