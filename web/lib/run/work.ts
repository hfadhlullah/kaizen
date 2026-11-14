// What the run workspace and Settings remember between redraws. Engine state: nothing draws it, so it is a plain object, not a
// store. The panel's own (the /run reply, the tab asked for, the tabs it has) is panel-store.ts.
export const work = {
  // The agent terminal a card or the sidebar asked for, selected once its tab exists; and the one a launch just opened.
  wantTerm: null as string | null,
  wantPty: null as null | { key: string; at: number },
  // Settings and the Icebox fill the same panel after a fetch: a fill only lands if no other view or fill started since.
  pageGen: 0,
  // The settings search survives the re-render each save does; the menu starts it empty. Handed to the page when it opens.
  setQ: "",
  setBack: false,
};
