import { post } from "./api.ts";
import { $, html } from "./dom.ts";
import { openSettings } from "./settings.ts";
import { view } from "./views.ts";

// A newer kaizen on npm: a dot on Settings, and an Update bar at the top of that page.
// The server upgrades and starts a board on the new version, which replaces this one;
// the hello with its new boot id reloads the page (listen()). With none known, the bar
// is a quiet row whose Check for updates asks npm now instead of the server's 6 h cache.
let upd = null,
  ver = null;
export function gotVer(v) {
  ver = v;
  upd = v.update ? v : null;
  const a = document.querySelector('.rail a[data-view="settings"]');
  a.classList.toggle("upd", !!upd);
  a.title = upd ? `Settings: kaizen ${v.latest} is available` : "Settings";
  return !!upd;
}
export function updBar() {
  const d = document.createElement("div");
  d.className = `updbar${upd ? "" : " quiet"}`;
  if (!upd) {
    d.innerHTML = html`<span id="upd-msg" aria-live="polite">${ver ? `kaizen ${ver.version}` : "kaizen"}</span><button class="btn" id="upd-chk">Check for updates</button>`;
  } else {
    // What's new: each newer release's one-line title, shown on hover, focus or click.
    const notes = (upd.notes || []).map((n) => html`<li><b>${n.v}</b> ${n.text}</li>`);
    const news = notes.length
      ? html`<span class="updnew"><button class="btn" aria-describedby="upd-notes">What's new</button><span class="updpop" id="upd-notes" role="tooltip"><ul>${notes}</ul><a href="https://github.com/hfadhlullah/kaizen/releases" target="_blank" rel="noopener">All release notes</a></span></span>`
      : "";
    d.innerHTML = html`<span>kaizen <b>${upd.latest}</b> is available. You are running ${upd.version}.</span><span class="updact">${news}<button class="btn" id="upd-chk">Check for updates</button><button class="btn pri" id="upd-go">Update kaizen</button></span>`;
  }
  if (ver && ver.failed) d.insertAdjacentHTML("afterbegin", html`<span class="updfail" role="alert">Last update failed: ${ver.failed}</span>`);
  $("pbody").prepend(d);
  const check = $("upd-chk");
  check.onclick = async () => {
    check.disabled = true;
    check.textContent = "Checking…";
    const v = await fetch("/version?fresh=1")
      .then((r) => r.json())
      .catch(() => null);
    if (!d.isConnected) return;
    check.disabled = false;
    if (!v || !v.latest) {
      if (upd) check.textContent = "Could not check. Try again";
      else $("upd-msg").textContent = "Could not reach npm. Try again later.";
      return;
    }
    gotVer(v);
    d.remove();
    updBar();
    if (upd) $("upd-go").focus();
    else {
      $("upd-msg").textContent = `kaizen ${v.version} is up to date.`;
      $("upd-chk").focus();
    }
  };
  if (!upd) return;
  const b = $("upd-go");
  b.onclick = async () => {
    if (!confirm(`Update kaizen to ${upd.latest}? The board restarts, and agents running inside cards stop.`)) return;
    b.disabled = true;
    b.textContent = "Updating…";
    const r = await post("/upgrade", {});
    if (!r.ok) {
      b.disabled = false;
      b.textContent = "Update kaizen";
      return;
    }
    b.textContent = "Restarting…";
    setTimeout(() => location.reload(), 20000);
  };
}

export function initUpdate() {
  fetch("/version")
    .then((r) => r.json())
    .then((v) => {
      if (gotVer(v) && view === "settings") openSettings();
    })
    .catch(() => {});
}
