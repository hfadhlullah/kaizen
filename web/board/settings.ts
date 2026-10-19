import { store } from "./store.ts";
import { termStop } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { stopDictation } from "./dictation.ts";
import { $, esc, SKEL } from "./dom.ts";
import { close } from "./panel.ts";
import { askNotify, toast } from "./toast.ts";
import { updBar } from "./update.ts";
import { view } from "./views.ts";

// ---- settings
// Rows in config order, grouped as the TUI groups them.
const groups = (rows) => {
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.group)) m.set(r.group, []);
    m.get(r.group).push(r);
  }
  return [...m];
};
export async function openSettings() {
  if (view !== "settings") return;
  const gen = ++store.pageGen;
  stopDictation(true);
  // Coming from another page or a card, its body goes now, not when the fetch answers.
  if (!$("panel").classList.contains("open") || $("ptitle").textContent !== "Settings") {
    $("pbody").innerHTML = SKEL;
    $("psub").textContent = "";
  }
  termStop();
  store.openKey = null;
  store.runDoc = null;
  $("pterm").hidden = true;
  $("panel").classList.add("open");
  $("scrim").classList.add("on");
  $("ptitle").textContent = "Settings";
  $("ptabs").innerHTML = "";
  $("pfoot").innerHTML = "";
  const cur = document.documentElement.dataset.theme || "system";
  const cfg = await fetch("/settings")
    .then((r) => r.json())
    .catch(() => null);
  const gg = await fetch("/google")
    .then((r) => r.json())
    .catch(() => ({}));
  if (gen !== store.pageGen) return;
  $("psub").textContent = "";
  $("psub").title = "";
  // One control per row: a switch for on/off, one segment per value for a small number,
  // a select for a choice. The row's label names the control; its help sits under it.
  const ctl = (id, vals, on) => {
    // The preset is a segmented control over the tiers; custom, which only an edit to another row makes, lights none.
    if (id === "s-preset")
      return `<span class="bar" id="${id}" role="group" aria-label="Preset">${vals
        .filter((v) => v !== "custom")
        .map((v) => `<button id="${id}-${v}" data-v="${v}" class="${v === on ? "on" : ""}" aria-pressed="${v === on}">${v}</button>`)
        .join("")}</span>`;
    if (vals.length === 2 && vals.includes("true") && vals.includes("false")) {
      const yes = on === "true";
      return `<button class="chk${yes ? " on" : ""}" id="${id}" data-v="${yes ? "false" : "true"}" role="switch" aria-checked="${yes}" title="${yes ? "On" : "Off"}"></button>`;
    }
    if (vals.every((v) => /^\d+$/.test(v)))
      return `<span class="bar" id="${id}" role="group">${vals.map((v) => `<button data-v="${v}" class="${v === on ? "on" : ""}" aria-pressed="${v === on}">${v}</button>`).join("")}</span>`;
    return `<select class="sel" id="${id}">${vals.map((v) => `<option value="${esc(v)}"${v === on ? " selected" : ""}>${v === "" ? "—" : esc(v)}</option>`).join("")}</select>`;
  };
  const row = (label, control, hint, id, q) =>
    `<div class="srow" data-q="${esc(q.toLowerCase())}"><label for="${id}">${esc(label)}</label>${control}<p class="hint">${hint}</p></div>`;
  const hadFocus = document.activeElement?.id === "sq";
  const np = typeof Notification === "undefined" ? null : Notification.permission;
  const ntHelp =
    "A desktop notification when a run starts waiting on you." +
    (np ? (np === "denied" ? " Blocked in this browser's site settings." : "") : " Not supported in this browser.");
  const names = [...(cfg ? groups(cfg.rows).map(([g]) => g) : []), "Google", "Browser"];
  $("pbody").innerHTML =
    `<div class="sq"><input class="sel" id="sq" type="search" placeholder="Search settings" aria-label="Search settings" spellcheck="false" autocomplete="off" value="${esc(store.setQ)}"><div class="sjump" role="group" aria-label="Jump to section">${names.map((g) => `<button data-g="${esc(g)}">${esc(g)}</button>`).join("")}</div></div>
  ${
    cfg
      ? groups(cfg.rows)
          .map(
            ([g, rows]) =>
              `<h3 class="sg">${esc(g)}</h3><div class="sgrp">${rows
                .map((r) => {
                  const id = "s-" + r.key.replace(/\./g, "-");
                  return row(
                    r.label,
                    r.text
                      ? r.folder
                        ? `<span class="fpick"><input class="sel" id="${id}" value="${esc(r.value)}" placeholder="not set" spellcheck="false"><button class="btn" id="${id}-pick" type="button">Browse…</button></span>`
                        : `<input class="sel" id="${id}" value="${esc(r.value)}" placeholder="not set" spellcheck="false">`
                      : ctl(id, r.values, r.value),
                    esc(r.help),
                    id,
                    [r.label, r.help, r.key, g, ...r.values].join(" "),
                  );
                })
                .join("")}</div>`,
          )
          .join("")
      : `<p class="snone">Settings could not be read. Run <code>kaizen settings</code>.</p>`
  }
  <h3 class="sg">Google</h3><div class="sgrp">${row("OAuth client id", `<input class="sel" id="gg-id" placeholder="${gg.hasClient ? "saved; type to replace" : "from Google Cloud, Desktop app"}" spellcheck="false" autocomplete="off">`, "Kaizen writes Done into a sheet through your own Google client: create an OAuth client of type Desktop app in Google Cloud and enable the Sheets API. Nothing is shared with other installs.", "gg-id", "google oauth client id sheets write back")}
  ${row("OAuth client secret", `<span class="fpick"><input class="sel" id="gg-secret" type="password" placeholder="${gg.hasClient ? "saved; type to replace" : ""}" spellcheck="false" autocomplete="off"><button class="btn" id="gg-save" type="button">Save</button></span>`, "Kept in ~/.kaizen/google.json, readable only by you. Saving a new client signs Google out.", "gg-secret", "google oauth client secret")}
  ${row("Google account", `<button class="btn${gg.connected ? "" : " pri"}" id="gg-conn" type="button"${gg.hasClient || gg.connected ? "" : " disabled"}>${gg.connected ? "Disconnect" : "Connect"}</button>`, gg.connected ? "Connected. Sources with Write back on put Done in the sheet row once their run is done." : "Connect after saving the client. Needed only for Write back on sheet sources.", "gg-conn", "google account connect sheets write back")}</div>
  <h3 class="sg">Browser</h3><div class="sgrp">${row("Theme", ctl("th", ["system", "light", "dark"], cur), "Light or dark for this browser only; system follows your device.", "th", "theme light dark system browser")}
  ${row("Notifications", `<button class="chk${np === "granted" ? " on" : ""}" id="nt" role="switch" aria-checked="${np === "granted"}"${np && np !== "denied" ? "" : " disabled"}></button>`, ntHelp, "nt", "notifications " + ntHelp + " browser")}</div>
  <p class="snone" id="snone" hidden></p>`;
  // Hides rows that do not match, then any group (and its chip) left with none.
  updBar();
  const heads = [...$("pbody").querySelectorAll(".sg")],
    chips = [...$("pbody").querySelectorAll(".sjump button")];
  const filter = () => {
    const q = store.setQ.trim().toLowerCase();
    let any = false;
    heads.forEach((h, i) => {
      let vis = false;
      for (const n of h.nextElementSibling.children) {
        n.hidden = !!q && !n.dataset.q.includes(q);
        vis ||= !n.hidden;
      }
      h.hidden = !vis;
      if (chips[i]) chips[i].hidden = !vis;
      any ||= vis;
    });
    $("snone").hidden = any;
    $("snone").textContent = `No setting matches “${store.setQ.trim()}”.`;
  };
  // Scrolled by measure: the pinned bar's height changes as the chips wrap.
  chips.forEach(
    (b, i) =>
      (b.onclick = () => {
        const pb = $("pbody");
        pb.scrollTo({
          top:
            pb.scrollTop +
            heads[i].getBoundingClientRect().top -
            pb.querySelector(".sq").getBoundingClientRect().bottom -
            8,
          behavior: "smooth",
        });
      }),
  );
  $("sq").oninput = (e) => {
    store.setQ = e.target.value;
    filter();
  };
  // Esc clears a search; with nothing to clear it closes the panel, as it does outside the field.
  $("sq").onkeydown = (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (store.setQ) {
      store.setQ = "";
      e.target.value = "";
      filter();
    } else close();
  };
  filter();
  if (hadFocus) {
    const f = $("sq");
    f.focus();
    f.setSelectionRange(f.value.length, f.value.length);
  }
  $("gg-save").onclick = async () => {
    const j = await post("/google", { op: "client", id: $("gg-id").value, secret: $("gg-secret").value });
    if (j.ok) toast("Saved");
    else toast(j.error || "Enter both the client id and the secret");
    openSettings();
  };
  $("gg-conn").onclick = async () => {
    if (gg.connected) {
      await post("/google", { op: "disconnect" });
      return openSettings();
    }
    const w = window.open("", "_blank");
    const j = await post("/google", { op: "connect" });
    if (j.ok && w) w.location = j.url;
    else {
      w?.close();
      toast(j.error || "Could not start Google sign-in");
    }
  };
  $("th").onchange = (e) => setTheme(e.target.value);
  $("nt").onclick = () => {
    askNotify();
    setTimeout(openSettings, 300);
  };
  if (cfg)
    cfg.rows.forEach((r) => {
      const el = $("s-" + r.key.replace(/\./g, "-"));
      const save = async (v) => {
        const f = document.activeElement?.id;
        const j = await post("/settings", { key: r.key, value: v });
        if (j.ok) toast("Saved");
        await openSettings();
        if (f?.startsWith("s-preset-")) $(f)?.focus();
      };
      if (el.tagName === "SELECT" || el.tagName === "INPUT")
        el.onchange = async () => {
          await save(el.value.trim());
          if (el.tagName === "INPUT") load();
        };
      else el.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => save(b.dataset.v)));
      if (el.matches(".chk")) el.onclick = () => save(el.dataset.v);
      // The system's own folder dialog, opened by the board: a page cannot read a real path.
      if (r.folder)
        $(el.id + "-pick").onclick = async () => {
          const j = await post("/pick-folder", {});
          if (j.path) {
            await save(j.path);
            load();
          }
        };
    });
}
