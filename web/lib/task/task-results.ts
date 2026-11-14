// Typed task outputs. Only server-issued artifact routes are embedded; live URLs are
// separate, mutable references and active HTML/SVG files remain downloads.
export type TaskArtifact = {
  id: string;
  name: string;
  kind: string;
  mediaType?: string;
  preview?: string | boolean;
  url?: string;
  size?: number;
  missing?: boolean;
  source?: string;
};
export type TaskResult = {
  id: string;
  title?: string;
  summary?: string;
  createdAt?: number | string;
  artifacts: TaskArtifact[];
  checks?: (string | { label?: string; outcome?: string; evidence?: string })[];
  limitations?: string[];
  liveUrl?: string;
  storedSize?: number;
  size?: number;
};
export const webUrl = (value: unknown) => {
  try {
    const u = new URL(String(value));
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
};
export const storedUrl = (value: unknown) =>
  typeof value === "string" && /^\/task-artifact(?:\?|\/)/.test(value) && !value.includes("\\") && !/[\r\n]/.test(value)
    ? value
    : null;
export const sizeLabel = (n?: number) =>
  n == null
    ? ""
    : n < 1024
      ? `${n} B`
      : n < 1024 * 1024
        ? `${(n / 1024).toFixed(1)} KB`
        : `${(n / (1024 * 1024)).toFixed(1)} MB`;
export const isImage = (a: TaskArtifact) =>
  /^image\//.test(a.mediaType ?? "") || a.kind === "image" || a.kind === "screenshot";
export const isLive = (a: TaskArtifact) =>
  a.kind === "website" || a.kind === "app" || a.kind === "link" || a.kind === "live";
// HTML, scripts, XML and SVG can run code: they are offered as downloads, never embedded.
export const isActive = (a: TaskArtifact) =>
  /^(?:text\/(?:html|javascript|xml)|application\/(?:javascript|xml|xhtml\+xml)|image\/svg\+xml)(?:;|$)/i.test(
    a.mediaType ?? "",
  ) || /\.(html?|svg|m?js|xml)$/i.test(a.name);

export type ArtifactMode =
  | "missing" // no stored file or address, or the saved file is gone
  | "live" // a mutable web address, shown in a sandboxed frame
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "text" // embedded from a server-issued route
  | "download" // active content: Download only
  | "unavailable"; // a format with no viewer
// Which viewer an artifact gets. `selected` is false for a file that is only listed, not opened.
export function artifactMode(a: TaskArtifact, selected: boolean): { mode: ArtifactMode | "none"; href: string | null } {
  const live = isLive(a),
    href = live ? webUrl(a.url) : storedUrl(a.url);
  if (a.missing || !href) return { mode: "missing", href };
  if (!selected) return { mode: "none", href };
  if (live) return { mode: "live", href };
  if (isActive(a)) return { mode: "download", href };
  if (a.preview === false || a.preview === "download" || a.preview === "none") return { mode: "unavailable", href };
  const t = a.mediaType ?? "";
  if (/^image\//.test(t) || a.kind === "image" || a.kind === "screenshot") return { mode: "image", href };
  if (/^video\//.test(t) || a.kind === "video") return { mode: "video", href };
  if (/^audio\//.test(t) || a.kind === "audio") return { mode: "audio", href };
  if (t === "application/pdf" || a.kind === "pdf") return { mode: "pdf", href };
  if (/^text\//.test(t) || ["text", "markdown", "document"].includes(a.kind)) return { mode: "text", href };
  return { mode: "unavailable", href };
}
export const savedLine = (r?: TaskResult) =>
  r?.createdAt
    ? `Saved ${new Date(r.createdAt).toLocaleString()}${(r.storedSize ?? r.size) != null ? " · " + sizeLabel(r.storedSize ?? r.size) + " preserved" : ""}`
    : "";
export const checkLine = (c: NonNullable<TaskResult["checks"]>[number]) =>
  typeof c === "string" ? c : [c.label, c.outcome, c.evidence].filter(Boolean).join(" — ");
// Legacy results carry no title of their own: no heading is drawn for them.
export const isLegacyResult = (r: TaskResult) => !r.title || r.title === "Existing result";
// A saved text file is fetched with its viewer; over 1 MB is cut short.
export const TEXT_LIMIT = 1_000_000;
