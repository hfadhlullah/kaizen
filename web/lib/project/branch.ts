/** A branch name from plain words; empty when nothing usable is left (the caller picks a name). */
export function branchSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9/._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/\/{2,}/g, "/")
    .replace(/(^|\/)[-.]+/g, "$1")
    .slice(0, 60)
    .replace(/[-./]+(\/|$)/g, "$1")
    .replace(/\/$/, "")
    .replace(/\.lock(\/|$)/g, "-lock$1");
}
