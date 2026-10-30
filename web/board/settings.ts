import { store } from "./store.ts";
import { termStop } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { stopDictation } from "./dictation.ts";
import { $, html, ico, SKEL } from "./dom.ts";
import { close } from "./panel.ts";
import { placeOf, SETTINGS_NAV } from "./settings-pages.ts";
import { askNotify, notifyOn, playSound, soundPick, SOUNDS, toast } from "./toast.ts";
import { updBar } from "./update.ts";
import { go, view } from "./views.ts";

// ---- settings
const PAGES = SETTINGS_NAV.flatMap(([, ps]) => ps);
const narrow = () => matchMedia("(max-width:640px)").matches;
// Ctrl+F searches settings, as in Orca. Only while the page shows: elsewhere it stays the browser's.
addEventListener("keydown", (e) => {
  if (view !== "settings" || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
  e.preventDefault();
  $("sq")?.focus();
});
export async function openSettings() {
  if (view !== "settings") return;
  const gen = ++store.pageGen;
  stopDictation(true);
  // Coming from another page or a card, its body goes now, not when the fetch answers.
  if (!$("panel").classList.contains("open") || $("ptitle").textContent !== "Settings") {
    $("pbody").innerHTML = SKEL;
    $("psub").textContent = "";
    store.setScope = store.all ? "all" : store.dir || store.S.dir || "all";
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
  const colour = document.documentElement.dataset.color || "monochrome";
  let cfg = await fetch("/settings?scope=" + encodeURIComponent(store.setScope))
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  // A project the board no longer knows: fall back to All projects.
  if (!cfg && store.setScope !== "all") {
    store.setScope = "all";
    return openSettings();
  }
  const gg = await fetch("/google")
    .then((r) => r.json())
    .catch(() => ({}));
  if (gen !== store.pageGen) return;
  $("psub").textContent = "";
  $("psub").title = "";
  // One control per row: a switch for on/off, one segment per value for a small number,
  // ‹ value › for a choice, stepping and wrapping like a game's options screen. The row's
  // label names the control; its help sits under it.
  const ctl = (id, vals, on) => {
    // The preset is a segmented control over the tiers; custom, which only an edit to another row makes, lights none.
    if (id === "s-preset")
      return html`<span class="bar" id="${id}" role="group" aria-label="Preset">${vals
        .filter((v) => v !== "custom")
        .map((v) => html`<button id="${id}-${v}" data-v="${v}" class="${v === on ? "on" : ""}" aria-pressed="${String(v === on)}">${v}</button>`)}</span>`;
    if (vals.length === 2 && vals.includes("true") && vals.includes("false")) {
      const yes = on === "true";
      return html`<button class="chk sm${yes ? " on" : ""}" id="${id}" data-v="${yes ? "false" : "true"}" role="switch" aria-checked="${String(yes)}" title="${yes ? "On" : "Off"}"></button>`;
    }
    // Short choices sit side by side, joined, as Orca's do; a long list keeps the stepper.
    if (vals.every((v) => /^\d+$/.test(v)) || (vals.length <= 5 && vals.every((v) => v) && vals.join("").length <= 32))
      return html`<span class="bar" id="${id}" role="group" aria-labelledby="${id}-l">${vals.map((v) => html`<button id="${id}-${v}" data-v="${v}" class="${v === on ? "on" : ""}" aria-pressed="${String(v === on)}">${v}</button>`)}</span>`;
    // Wired by stepper() below; the group takes its name from the row's label.
    return html`<span class="step" id="${id}" role="group" aria-labelledby="${id}-l"><button id="${id}-prev" aria-label="Previous">‹</button><output aria-live="polite">${on === "" ? "—" : on}</output><button id="${id}-next" aria-label="Next">›</button></span>`;
  };
  // `off`: the row has no effect while another setting stands as it is; dimmed, still editable.
  const onOff = (v) => (v === "true" ? "on" : v === "false" ? "off" : v === "" ? "—" : v);
  const scoped = cfg && cfg.scope !== "all";
  // What else a row says about its scope: projects that set it otherwise, or a Reset
  // for a value this project sets itself.
  const scopeNote = (r, id) =>
    r.own
        ? html`Set for this project · <button class="sreset" id="${id}-reset" type="button">Reset</button>`
        : r.overrides?.length
          ? r.overrides.map((o) => `${o.label}: ${onOff(o.value)}`).join(", ")
          : "";
  const row = (label, control, hint, id, q, off = false) =>
    html`<div class="srow${off ? " off" : ""}" data-q="${q.toLowerCase()}"><label for="${id}" id="${id}-l">${label}</label>${control}${hint ? html`<p class="hint">${hint}</p>` : ""}</div>`;
  const hadFocus = document.activeElement?.id === "sq";
  const np = typeof Notification === "undefined" ? null : Notification.permission;
  const nton = notifyOn();
  const ntHelp = !nton ? "Off in this browser" : np === "granted" ? "" : np === "denied" ? "Pop-ups blocked by this browser; the sound still plays" : np ? "Pop-ups wait for the browser to ask; the sound still plays" : "Pop-ups not supported here; the sound still plays";
  // Each page's subsections, in the order they first appear.
  const pageRows = new Map<string, Map<string, unknown[]>>(PAGES.map((p) => [p.id, new Map()]));
  const put = (page, sub, r) => {
    const m = pageRows.get(page);
    if (!m.has(sub)) m.set(sub, []);
    m.get(sub).push(r);
  };
  if (cfg) {
    put("general", "Scope", row(
      "Settings for",
      html`<select class="sel" id="s-scope">${[{ dir: "all", label: "All projects" }, ...cfg.projects].map((p) => html`<option value="${p.dir}"${p.dir === cfg.scope ? " selected" : ""}>${p.label}</option>`)}</select>`,
      scoped ? "This project's own .kaizen/config.yml; anything it does not set comes from All projects." : "~/.kaizen/config.yml; a project's own config wins where it sets a value.",
      "s-scope",
      "settings for scope project all projects",
    ));
    for (const r of cfg.rows) {
      const id = "s-" + r.key.replace(/\./g, "-");
      const [page, sub] = placeOf(r.key);
      put(page, sub + (scoped && r.group === "Board" ? " · all projects" : ""), row(
        r.label,
        r.text
          ? r.folder
            ? html`<span class="fpick"><input class="sel" id="${id}" value="${r.value}" placeholder="not set" spellcheck="false"><button class="btn" id="${id}-pick" type="button">Browse…</button></span>`
            : html`<input class="sel" id="${id}" value="${r.value}" placeholder="not set" spellcheck="false">`
          : ctl(id, r.values, r.value),
        ((t, n) => (t && n ? html`${t} · ${n}` : n || t))([r.help, r.idle].filter(Boolean).join(" · "), scopeNote(r, id)),
        id,
        [r.label, r.help, r.key, r.group, ...r.values].join(" "),
        !!r.idle,
      ));
    }
  }
  put("mobile", "Phone", row("Phone address", cfg?.phoneUrls?.length ? html`<span class="phoneurls">${cfg.phoneUrls.map((url) => html`<a href="${url}" target="_blank" rel="noopener">${url}</a>`)}</span>` : html`<span>Not set</span>`, cfg?.phoneUrls?.length ? "Configured address; Tailscale must be running on both devices." : "Run kaizen setup on this PC to connect your phone.", "phone-url", "phone address url tailscale setup"));
  put("integrations", "Google", row("OAuth client id", html`<input class="sel" id="gg-id" placeholder="${gg.hasClient ? "Saved. Paste a new one to replace it" : "Desktop app client id from Google Cloud"}" spellcheck="false" autocomplete="off">`, "", "gg-id", "google oauth client id sheets write back"));
  put("integrations", "Google", row("OAuth client secret", html`<span class="fpick"><input class="sel" id="gg-secret" type="password" placeholder="${gg.hasClient ? "Saved. Paste a new one to replace it" : ""}" spellcheck="false" autocomplete="off"><button class="btn" id="gg-save" type="button">Save</button></span>`, "", "gg-secret", "google oauth client secret"));
  put("integrations", "Google", row("Google account", html`<button class="btn${gg.connected ? "" : " pri"}" id="gg-conn" type="button"${gg.hasClient || gg.connected ? "" : " disabled"}>${gg.connected ? "Disconnect" : "Connect"}</button>`, "", "gg-conn", "google account connect sheets write back"));
  put("appearance", "Browser", row("Theme", ctl("th", ["system", "light", "dark"], cur), "", "th", "theme light dark system browser"));
  put("appearance", "Browser", row("Color", ctl("co", ["monochrome", "blue"], colour), "", "co", "color colour palette monochrome blue theme browser"));
  put("appearance", "Browser", row("Motion", ctl("mo", ["system", "full", "reduce"], document.documentElement.dataset.motion || "system"), "Animations on the board and notes. System follows the device's reduce-motion setting.", "mo", "motion animation reduce reduced browser"));
  put("notifications", "Browser", row("Notifications", html`<button class="chk sm${nton ? " on" : ""}" id="nt" role="switch" aria-checked="${String(nton)}"></button>`, ntHelp, "nt", "notifications " + ntHelp + " browser"));
  put("notifications", "Browser", row("Notification sound", ctl("ns", SOUNDS, soundPick()), "Plays with each notice. Changing it plays it.", "ns", "notification sound audio browser " + SOUNDS.join(" "), !nton));
  // A narrow screen starts on the list of pages, a wide one on the first page.
  store.setPage ??= new URLSearchParams(location.search).get("page") || "";
  const scopeName = scoped ? cfg.projects.find((p) => p.dir === cfg.scope)?.label : "";
  // A save redraws the page: the rows stay where they were scrolled to.
  const top = $("smain")?.scrollTop || 0;
  $("pbody").innerHTML = html`<div class="sset" id="sset">
    <nav class="snav" aria-label="Settings">
      <button class="sback" id="sback" type="button">${ico("chev")}Back to app</button>
      <div class="sq"><input class="sel" id="sq" type="search" placeholder="Search settings" aria-label="Search settings" spellcheck="false" autocomplete="off" value="${store.setQ}"></div>
      <div class="snavs">${SETTINGS_NAV.map(([g, ps]) => html`<div class="snavg"><p>${g}</p>${ps.map((p) => html`<button type="button" data-page="${p.id}">${ico(p.ico)}<span>${p.title}</span></button>`)}</div>`)}</div>
    </nav>
    <div class="smain" id="smain">
      ${PAGES.map((p) => html`<div class="spage" data-page="${p.id}">
        <button class="sup" type="button">${ico("chev")}Settings</button>
        <header><h2>${p.title}</h2><p>${p.desc}${scopeName ? ` Editing ${scopeName}.` : ""}</p></header>
        ${p.id === "general" ? html`<div id="supd"></div>` : ""}
        <div class="scard">${[...pageRows.get(p.id)].map(([sub, rows]) => html`<h3 class="sg">${sub}</h3><div class="sgrp">${rows}</div>`)}</div>
      </div>`)}
      ${cfg ? "" : html`<p class="snone">Settings could not be read. Run <code>kaizen settings</code>.</p>`}
      <p class="snone" id="snone" hidden></p>
    </div>
  </div>`;
  // Hides rows that do not match, then any subsection and page left with none. The page
  // shown is the one picked, or while searching the first that still has a match.
  updBar();
  const heads = [...$("pbody").querySelectorAll(".sg")];
  const filter = () => {
    const q = store.setQ.trim().toLowerCase();
    let any = false;
    heads.forEach((h) => {
      let vis = false;
      for (const n of h.nextElementSibling.children) {
        n.hidden = !!q && !n.dataset.q.includes(q);
        vis ||= !n.hidden;
      }
      h.hidden = !vis;
      any ||= vis;
    });
    $("snone").hidden = any;
    $("snone").textContent = `No setting matches “${store.setQ.trim()}”.`;
    const has = (s) => !!s.querySelector(".sg:not([hidden])");
    const secs = [...$("pbody").querySelectorAll<HTMLElement>(".spage")];
    const hits = secs.filter(has);
    const picked = store.setPage && secs.find((s) => s.dataset.page === store.setPage);
    const cur = (picked && has(picked) ? picked : null) || (q || !narrow() ? hits[0] : null);
    secs.forEach((s) => (s.hidden = s !== cur));
    $("sset").classList.toggle("pick", !cur);
    $("pbody").querySelectorAll<HTMLElement>(".snavg button").forEach((b) => {
      const on = b.dataset.page === cur?.dataset.page;
      b.hidden = !hits.some((s) => s.dataset.page === b.dataset.page);
      on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current");
    });
    $("pbody").querySelectorAll<HTMLElement>(".snavg").forEach((g) => (g.hidden = !g.querySelector("button:not([hidden])")));
  };
  // The page goes in the address, without a history step per page: Back to app leaves in one.
  const pick = (id) => {
    store.setPage = id;
    history.replaceState(null, "", "?view=settings" + (id ? "&page=" + id : ""));
    filter();
    $("pbody").scrollTop = $("smain").scrollTop = 0;
  };
  $("pbody").querySelectorAll<HTMLElement>(".snavg button").forEach((b) => (b.onclick = () => pick(b.dataset.page)));
  $("pbody").querySelectorAll<HTMLElement>(".sup").forEach((b) => (b.onclick = () => pick("")));
  // Back where Settings was opened from; arriving by address, Home.
  $("sback").onclick = () => (store.setBack ? history.back() : go("home", true));
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
  $("smain").scrollTop = top;
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
  // A stepper keeps its own position, so each click moves one value even before a save
  // re-renders the panel; the shown value changes at once and apply() gets the new one.
  // ←/→ press its arrows; focus moves to the arrow pressed.
  const stepper = (el, vals, on, apply) => {
    let i = Math.max(vals.indexOf(on), 0);
    const step = (d) => {
      i = (i + d + vals.length) % vals.length;
      el.querySelector("output").textContent = vals[i] === "" ? "—" : vals[i];
      apply(vals[i]);
    };
    $(el.id + "-prev").onclick = () => step(-1);
    $(el.id + "-next").onclick = () => step(1);
    el.onkeydown = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const b = $(el.id + (e.key === "ArrowLeft" ? "-prev" : "-next"));
      b.focus();
      b.click();
    };
  };
  // Re-rendering replaces the arrows, so the one pressed gets focus back.
  const refocus = async (f) => {
    await openSettings();
    if (f && /^s-/.test(f)) $(f)?.focus();
  };
  // A browser choice drawn as joined segments applies on click; a long list steps.
  const choice = (el, vals, on, apply) => {
    if (el.matches(".step")) return stepper(el, vals, on, apply);
    el.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => {
      apply(b.dataset.v);
      openSettings();
    }));
  };
  choice($("th"), ["system", "light", "dark"], cur, setTheme);
  choice($("co"), ["monochrome", "blue"], colour, setColor);
  choice($("mo"), ["system", "full", "reduce"], document.documentElement.dataset.motion || "system", setMotion);
  $("nt").onclick = () => {
    const on = !notifyOn();
    try {
      localStorage.setItem("kz-notify", on ? "on" : "off");
    } catch (e) {}
    if (on) askNotify();
    setTimeout(openSettings, 300);
  };
  choice($("ns"), SOUNDS, soundPick(), (v) => {
    try {
      localStorage.setItem("kz-sound", v);
    } catch (e) {}
    playSound(v);
  });
  if (cfg)
    $("s-scope").onchange = (e) => {
      store.setScope = e.target.value;
      openSettings();
    };
  if (cfg)
    cfg.rows.forEach((r) => {
      const el = $("s-" + r.key.replace(/\./g, "-"));
      if (r.own)
        $(el.id + "-reset").onclick = async () => {
          const j = await post("/settings", { key: r.key, scope: cfg.scope, reset: true });
          toast(j.ok ? "Reset to All projects" : j.error || "Could not reset");
          openSettings();
        };
      const save = async (v) => {
        const f = document.activeElement?.id;
        const j = await post("/settings", { key: r.key, value: v, scope: cfg.scope });
        if (j.ok) toast("Saved");
        await refocus(f);
      };
      if (el.tagName === "INPUT")
        el.onchange = async () => {
          await save(el.value.trim());
          load();
        };
      else el.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => save(b.dataset.v)));
      if (el.matches(".chk")) el.onclick = () => save(el.dataset.v);
      // Clicks in quick succession save once, the value they settle on.
      let t;
      if (el.matches(".step"))
        stepper(el, r.values, r.value, (v) => {
          clearTimeout(t);
          t = setTimeout(() => save(v), 300);
        });
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
