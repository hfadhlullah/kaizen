import { checkUpdate, useUpdate } from "../lib/settings/update.ts";

// The rail's Settings link carries a dot while a newer kaizen is known. The About bar and the card are React
// (components/update-bar.tsx) and read the same store.
const mark = () => {
  const v = useUpdate.getState().ver,
    a = document.querySelector<HTMLElement>('.rail a[data-view="settings"]')!;
  a.classList.toggle("upd", !!v?.update);
  a.title = v?.update
    ? `Settings: ${globalThis.kaizenDesktop ? "Kaizen" : "kaizen"} ${v.latest} is available`
    : "Settings";
};
// Hourly so a tab left open still hears of a release; the server's cache limits npm to every 6 h.
export function initUpdate() {
  useUpdate.subscribe(mark);
  void checkUpdate();
  setInterval(checkUpdate, 3600_000);
}
