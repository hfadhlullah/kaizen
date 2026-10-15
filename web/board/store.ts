// State more than one module writes: the board's data, the open card and form, the
// panel's tab and doc, and the page filters. Everything else lives in the module that
// owns it.
export const store = {
  S: { project: null, projects: [], cards: [], now: Date.now(), all: false },
  all: new URLSearchParams(location.search).get("all") !== "0",
  openKey: null,
  mode: null,
  modeKey: null,
  menuKey: null,
  tab: "request",
  lastTab: "request",
  runDoc: null,
  clearMenu: false,
  wantTerm: null,
  // The settings search survives the re-render each save does; the gear button starts it empty.
  setQ: "",
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
