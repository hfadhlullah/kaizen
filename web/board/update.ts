import { post } from "./api.ts";
import { $, esc } from "./dom.ts";
import { openSettings } from "./settings.ts";
import { view } from "./views.ts";

// A newer kaizen on npm: a dot on Settings, and an Update bar at the top of that page.
// The server upgrades and starts a board on the new version, which replaces this one;
// the hello with its new boot id reloads the page (listen()). With none known, the bar
// is a quiet row whose Check for updates asks npm now instead of the server's 6 h cache.
let upd = null,
  ver = null;
function gotVer(v) {
  ver = v;
  if (!v.update) return false;
  upd = v;
  const a = document.querySelector('.rail a[data-view="settings"]');
  a.classList.add("upd");
  a.title = `Settings: kaizen ${v.latest} is available`;
  return true;
}
export function updBar() {
  if (!upd) {
    const d = document.createElement("div");
    d.className = "updbar quiet";
    d.innerHTML = `<span id="upd-msg" aria-live="polite">${ver ? `You are running kaizen ${esc(ver.version)}.` : "kaizen"}</span><button class="btn" id="upd-chk">Check for updates</button>`;
    $("pbody").prepend(d);
    const b = $("upd-chk");
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = "Checking…";
      const v = await fetch("/version?fresh=1")
        .then((r) => r.json())
        .catch(() => null);
      if (!d.isConnected) return;
      b.disabled = false;
      b.textContent = "Check for updates";
      if (v && gotVer(v)) {
        d.remove();
        updBar();
        $("upd-go").focus();
        return;
      }
      $("upd-msg").textContent =
        !v || !v.latest ? "Could not reach npm. Try again later." : `kaizen ${v.version} is up to date.`;
    };
    return;
  }
  const d = document.createElement("div");
  d.className = "updbar";
  // What's new: each newer release's one-line title, shown on hover, focus or click.
  const notes = (upd.notes || [])
    .map((n) => `<li><b>${esc(n.v)}</b> ${esc(n.text)}</li>`)
    .join("");
  const news = notes
    ? `<span class="updnew"><button class="btn" aria-describedby="upd-notes">What's new</button><span class="updpop" id="upd-notes" role="tooltip"><ul>${notes}</ul><a href="https://github.com/hfadhlullah/kaizen/releases" target="_blank" rel="noopener">All release notes</a></span></span>`
    : "";
  d.innerHTML = `<span>kaizen <b>${esc(upd.latest)}</b> is available. You are running ${esc(upd.version)}.</span><span class="updact">${news}<button class="btn pri" id="upd-go">Update kaizen</button></span>`;
  $("pbody").prepend(d);
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
