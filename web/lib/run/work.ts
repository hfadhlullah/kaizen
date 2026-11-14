// What the open card's panel and the run workspace remember between redraws. Engine state: nothing draws it (the panel's own
// state is panel-store.ts), so it is a plain object, not a store.
export const work = {
  // The /run reply for the card whose panel is up.
  runDoc: null as any,
  // The tab the panel is on, and the keys of the tabs it has (the arrow keys walk them).
  tab: "request",
  ptabs: [] as string[],
  // The agent terminal a card or the sidebar asked for, selected once its tab exists; and the one a launch just opened.
  wantTerm: null as string | null,
  wantPty: null as null | { key: string; at: number },
  // Settings and the Icebox fill the same panel after a fetch: a fill only lands if no other view or fill started since.
  pageGen: 0,
  // The settings search survives the re-render each save does; the menu starts it empty. Handed to the page when it opens.
  setQ: "",
  setBack: false,
};
