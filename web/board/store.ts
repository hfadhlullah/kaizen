import { getServer, setServer } from "@lib/server";

// State more than one engine module writes: the open card and form, the panel's tab and doc, and the page filters.
// The server's data (`S`, the all-projects flag, the picked project, the live shells) is the server store's
// (lib/server): the accessors below read and write it, so the engines keep their `store.S.cards` while the poller
// is the one that fetches. Everything else lives in the module that owns it.
export const store = {
  // The /state reply for this page; the poller replaces it.
  get S() {
    return getServer().state;
  },
  // The page shows every project.
  get all() {
    return getServer().all;
  },
  set all(all: boolean) {
    setServer({ all });
  },
  // The project this page picked; null is wherever the board started.
  get dir() {
    return getServer().dir;
  },
  set dir(dir: string | null) {
    setServer({ dir });
  },
  // Live shells from GET /shells (the footer reads them): tiles on the Terminal page.
  get shells() {
    return getServer().shells;
  },
  openKey: null,
  ptabs: [], // the keys of the run panel's tabs (components/run/panel-tabs.tsx draws them), for the arrow keys
  // Cards that just started needing you: card() gives them one .flash.
  flash: new Set<string>(),
  tab: "request",
  lastTab: "request",
  runDoc: null,
  wantTerm: null,
  // The terminal a launch just opened (its pty key), selected in the run workspace once its tab exists.
  wantPty: null as null | { key: string; at: number },
  // The settings search survives the re-render each save does; the gear button starts it empty.
  setQ: "",
  // Handed to the Settings page when it opens (lib/settings/settings-store.ts keeps them after): Back to app goes back, not Home.
  setBack: false,
  // Settings and the Icebox fill the same panel after a fetch: a fill only lands if no other view
  // or fill started since, or a slow answer paints one page under the other's title.
  pageGen: 0,
  // The project picker's list.
  PL: [],
  // The all-projects filter: tick the projects to show; none ticked shows every one. Kept per browser.
  shown: new Set(
    (() => {
      try {
        return JSON.parse(localStorage.getItem("kz-show")) || [];
      } catch (e) {
        return [];
      }
    })(),
  ),
};
