// The notebook's text rules now live in lib/notebook/text.ts; cli/ (docs, notes tests) still imports them from here.
// A direct file path, not the lib index: the CLI must not reach the page's store (zustand is a dev dependency).
export * from "../lib/notebook/text.ts";
