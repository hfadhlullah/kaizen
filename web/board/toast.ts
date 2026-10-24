import { $ } from "./dom.ts";

// With `report`, the toast carries a link to a prefilled GitHub bug form (/issue) and
// stays long enough to click it.
let tt;
export function toast(s, report) {
  const t = $("toast");
  t.textContent = s;
  t.classList.toggle("rep", !!report);
  if (report) {
    const a = document.createElement("a");
    a.href = "/issue?" + new URLSearchParams(report);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Report";
    t.append(" ", a);
  }
  t.classList.add("on");
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove("on"), report ? 8000 : 4000);
}
export function askNotify() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
  } catch (e) {}
}
// tag: one notification per thing, so several open board tabs replace each other's.
export function notifyUser(body, tag?: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted")
      new Notification("kaizen", { body, icon: "/logo.png", tag });
  } catch (e) {}
}
