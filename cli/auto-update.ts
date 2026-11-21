// When the board may update itself (Settings → General → Updates → Update automatically). An update restarts the board, so it waits
// while anything could be lost: a live terminal (an agent or a shell), or an open board page (a reload under someone typing).
// In the desktop app the app's own window is a board page for as long as the app runs, so there only terminals hold it back.
export type Due = "go" | "off" | "busy" | "current" | "agents" | "page";
export function autoUpdateDue(o: { on: boolean; desktop: boolean; upgrading: boolean; newer: boolean; terminalsAlive: boolean; pagesOpen: boolean }): Due {
  if (!o.on) return "off";
  if (o.upgrading) return "busy";
  if (!o.newer) return "current";
  if (o.terminalsAlive) return "agents";
  if (o.pagesOpen && !o.desktop) return "page";
  return "go";
}

// One tick of the automatic update, with what it touches passed in so it can be tested: the switch, npm's newest version, the
// board's own state. Returns why it did or did not update.
export type Deps = {
  on: () => Promise<boolean>;
  latest: () => Promise<string | null>;
  newer: (latest: string) => boolean;
  desktop: boolean;
  upgrading: () => boolean;
  terminalsAlive: () => boolean;
  pagesOpen: () => boolean;
  upgrade: () => Promise<unknown>;
};
export async function autoUpdateTick(d: Deps): Promise<Due> {
  const on = await d.on();
  if (!on) return "off";                                    // nothing else is asked, not even npm
  const latest = await d.latest();
  const due = autoUpdateDue({ on, desktop: d.desktop, upgrading: d.upgrading(), newer: !!latest && d.newer(latest), terminalsAlive: d.terminalsAlive(), pagesOpen: d.pagesOpen() });
  if (due === "go") await d.upgrade();
  return due;
}
