import { store } from "./store.ts";
import { api } from "./api.ts";
import { $, avatar, el, icon, toast } from "./dom.ts";
import { bots, loadBots, renderList, setBoard, shown } from "./sidebar.ts";
import { select } from "./thread.ts";
import { openTo } from "./to.ts";

// ---- right panel ----
export function openSide(kind) {
  store.panel = kind;
  $("side").hidden = false;
  $("sideBack").hidden = true;
  if (kind === "agent") renderAgent();
  else renderSettings();
}
export function closeSide() {
  store.panel = null;
  $("side").hidden = true;
}

async function patchBot(p) {
  try {
    store.current = await api(`/bots/${store.current.id}`, { method: "PATCH", body: p });
    await loadBots();
    $("tname").textContent = store.current.name;
    $("ttitle").textContent = store.current.title || "";
    $("tav").replaceChildren(avatar(store.current, "sm"));
  } catch (e) {
    toast(e.message);
  }
}
export async function renderAgent() {
  if (!store.current) return closeSide();
  $("sideTitle").textContent = "Agent";
  const b = store.current;
  const name = el("input", {
    class: "f",
    value: b.name,
    "aria-label": "Name",
    onchange: () => patchBot({ name: name.value }),
  });
  const title = el("input", {
    class: "f",
    value: b.title,
    placeholder: "Add a title",
    "aria-label": "Title",
    onchange: () => patchBot({ title: title.value }),
  });
  const desc = el("textarea", {
    class: "f",
    "aria-label": "Description",
    onchange: () => patchBot({ description: desc.value }),
  });
  desc.value = b.description;
  const proj = el(
    "select",
    { class: "f", "aria-label": "Default project", onchange: () => patchBot({ project: proj.value }) },
    el("option", { value: "" }, store.board.ok ? "None: ask each time" : "None (board not running)"),
    store.board.projects.map((p) => el("option", { value: p.dir, selected: p.dir === b.project }, p.label)),
  );
  if (b.project && !store.board.projects.some((p) => p.dir === b.project))
    proj.append(el("option", { value: b.project, selected: true }, `${b.project} (not on the board now)`));
  const notifyBox = el("input", {
    type: "checkbox",
    checked: !!b.notify,
    "aria-label": "Notifications",
    onchange: async () => {
      if (notifyBox.checked && "Notification" in window && Notification.permission === "default")
        await Notification.requestPermission();
      patchBot({ notify: notifyBox.checked });
    },
  });
  $("sideBody").replaceChildren(
    el("div", { style: { display: "grid", placeItems: "center", marginTop: "6px" } }, avatar(b, "lg")),
    el("label", { class: "k" }, "Name"),
    name,
    el("label", { class: "k" }, "Title (optional)"),
    title,
    el("label", { class: "k" }, "Description: shapes how this agent works"),
    desc,
    el("label", { class: "k" }, "Default project"),
    proj,
    el(
      "div",
      { class: "toggle" },
      el(
        "div",
        {},
        "Notifications",
        el(
          "small",
          {},
          "When this agent finishes, needs your click, or a run it started waits on you, while this tab is in the background.",
        ),
      ),
      notifyBox,
    ),
    el("label", { class: "k" }, "Routines"),
    el("div", { id: "routines" }),
    el(
      "div",
      { class: "row", style: { marginTop: "20px" } },
      el(
        "button",
        {
          class: "btn",
          title: "Remove from the sidebar; its chat stays, and + brings it back",
          onclick: async () => {
            await api(`/bots/${b.id}`, { method: "PATCH", body: { hidden: true } });
            closeSide();
            store.current = null;
            await loadBots();
            shown()[0] ? select(shown()[0].id) : openTo();
          },
        },
        "Dismiss chat",
      ),
      el(
        "button",
        {
          class: "btn danger",
          onclick: async () => {
            if (!confirm(`Delete ${b.name}, its messages, cards and memory?`)) return;
            await api(`/bots/${b.id}`, { method: "DELETE" });
            closeSide();
            store.current = null;
            await loadBots();
            shown()[0] ? select(shown()[0].id) : openTo();
          },
        },
        "Delete agent",
      ),
    ),
  );
  renderRoutines();
}
// Only the Routines block, so a refresh never discards text being typed elsewhere in the panel.
export async function renderRoutines() {
  const b = store.current,
    box = $("routines");
  if (!b || !box) return;
  const rs = await api(`/bots/${b.id}/routines`);
  const when = (t) => new Date(t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  box.replaceChildren(
    ...(rs.length
      ? rs.map((x) =>
          el(
            "div",
            { class: "toggle", style: { marginTop: "6px" } },
            el(
              "div",
              {},
              el("b", {}, x.name),
              el("small", {}, x.label),
              el("small", {}, x.enabled ? `Next: ${when(x.next_run)}` : "Paused"),
            ),
            el("input", {
              type: "checkbox",
              checked: !!x.enabled,
              "aria-label": `Run ${x.name}`,
              title: x.enabled ? "Pause" : "Resume",
              onchange: async (e) => {
                try {
                  await api(`/bots/${b.id}/routines/${x.id}`, { method: "PATCH", body: { enabled: e.target.checked } });
                } catch (err) {
                  toast(err.message);
                }
                renderRoutines();
              },
            }),
            el(
              "button",
              {
                class: "btn danger",
                "aria-label": `Delete ${x.name}`,
                onclick: async () => {
                  if (!confirm(`Delete the routine "${x.name}"?`)) return;
                  await api(`/bots/${b.id}/routines/${x.id}`, { method: "DELETE" });
                  renderRoutines();
                },
              },
              "✕",
            ),
          ),
        )
      : [el("p", { class: "dim" }, "None yet. Ask in chat, like: every weekday at 7, brief me on the board.")]),
  );
}
async function renderSettings() {
  $("sideTitle").textContent = "Settings";
  $("sideBack").hidden = !store.current;
  const s = await api("/settings");
  const user = el("input", {
    class: "f",
    value: s.userName,
    "aria-label": "Your name",
    onchange: async () => {
      await api("/settings", { method: "POST", body: { userName: user.value } });
      store.info.user = user.value.trim() || "You";
      renderList();
    },
  });
  const provider = el(
    "select",
    { class: "f", "aria-label": "Provider" },
    ["anthropic", "openai", "requesty"].map((p) =>
      el(
        "option",
        { value: p, selected: p === s.provider, disabled: !s.keys[p] },
        `${p}${s.keys[p] ? "" : " (no key in .env)"}`,
      ),
    ),
  );
  const list = el("datalist", { id: "models" });
  const model = el("input", {
    class: "f",
    value: s.model || "",
    list: "models",
    "aria-label": "Model",
    placeholder: "Model id",
  });
  const fill = async () => {
    const ids = await api(`/settings/models?provider=${provider.value}`).catch(() => []);
    list.replaceChildren(...ids.map((i) => el("option", { value: i })));
  };
  provider.onchange = () => {
    model.value = "";
    fill();
  };
  const status = el("span", { class: "dim" });
  const save = el(
    "button",
    {
      class: "btn pri",
      onclick: async () => {
        save.disabled = true;
        status.textContent = "Checking the model answers…";
        try {
          await api("/settings", { method: "POST", body: { provider: provider.value, model: model.value } });
          status.textContent = "Saved. New messages use this model.";
        } catch (e) {
          status.textContent = e.message;
        } finally {
          save.disabled = false;
        }
      },
    },
    "Save model",
  );
  const url = el("input", { class: "f", value: s.boardUrl, "aria-label": "Board URL" });
  const bstat = el(
    "span",
    { class: "dim" },
    store.board.ok
      ? `Connected${store.board.version ? ` · kaizen ${store.board.version}` : ""}`
      : "Not running. Start it with: kaizen web",
  );
  const startBtn =
    !store.board.ok &&
    s.canStartBoard &&
    el(
      "button",
      {
        class: "btn",
        onclick: async () => {
          startBtn.disabled = true;
          bstat.textContent = "Starting the board…";
          try {
            await api("/board/start", { method: "POST" });
            await loadBoard();
            renderSettings();
          } catch (e) {
            bstat.textContent = e.message;
            startBtn.disabled = false;
          }
        },
      },
      "Start board",
    );
  const auto = el("input", {
    type: "checkbox",
    checked: s.autoBoard,
    onchange: async () => {
      try {
        await api("/settings", { method: "POST", body: { autoBoard: auto.checked } });
      } catch (e) {
        auto.checked = !auto.checked;
        toast(e.message);
      }
    },
  });
  const theme = el(
    "select",
    { class: "f", "aria-label": "Theme", onchange: () => setTheme(theme.value) },
    [
      ["", "System"],
      ["light", "Light"],
      ["dark", "Dark"],
    ].map(([v, t]) => el("option", { value: v, selected: (document.documentElement.dataset.theme || "") === v }, t)),
  );
  $("sideBody").replaceChildren(
    sec(["You"], el("label", { class: "k" }, "Name"), user),
    sec(
      ["AI model", "Keys stay in .env and never reach this page. What you type goes to this provider."],
      el("label", { class: "k" }, "Provider"),
      provider,
      el("label", { class: "k" }, "Model"),
      model,
      list,
      el("div", { class: "row", style: { marginTop: "10px", flexWrap: "wrap" } }, save, status),
    ),
    sec(
      ["Kaizen board"],
      el("label", { class: "k" }, "Board URL"),
      el(
        "div",
        { class: "row" },
        url,
        el(
          "button",
          {
            class: "btn",
            onclick: async () => {
              try {
                await api("/settings", { method: "POST", body: { boardUrl: url.value } });
                await loadBoard();
                renderSettings();
              } catch (e) {
                toast(e.message);
              }
            },
          },
          "Save",
        ),
      ),
      el(
        "div",
        { class: "row", style: { marginTop: "8px", flexWrap: "wrap" } },
        el("span", { class: "st", style: { background: store.board.ok ? "var(--ok)" : "var(--danger)" } }),
        bstat,
        startBtn,
      ),
      el("label", { class: "toggle" }, auto, el("div", {}, el("b", {}, "Start with Kaizen Bot"))),
    ),
    computerPilot(s.computer),
    sec(
      ["Appearance"],
      el("label", { class: "k" }, "Theme"),
      theme,
      el("label", { class: "k" }, "Dictation"),
      el(
        "p",
        { class: "dim", style: { margin: 0, display: "flex", gap: "6px", alignItems: "center" } },
        "Whisper, runs in this browser",
        tip(
          "The mic runs Whisper (base, about 80 MB) in this browser. It downloads once from huggingface.co and cdn.jsdelivr.net on the first press; your audio never leaves the browser.",
        ),
      ),
    ),
    sec(
      ["Data"],
      el("label", { class: "k" }, "Approved drafts"),
      el("a", { class: "btn", href: "/drafts/export", download: true }, "Export as Markdown"),
    ),
  );
  // The app has no console window to close, so it is stopped from here.
  if (s.canQuit)
    $("sideBody").append(
      sec(
        ["Kaizen Bot"],
        el(
          "button",
          {
            class: "btn danger",
            style: { marginTop: "8px" },
            onclick: async () => {
              try {
                await api("/quit", { method: "POST" });
                document.body.replaceChildren(
                  el(
                    "p",
                    { class: "dim", style: { padding: "24px" } },
                    "Kaizen Bot has stopped. Open it again to carry on.",
                  ),
                );
              } catch (e) {
                toast(e.message);
              }
            },
          },
          "Quit Kaizen Bot",
        ),
      ),
    );
  fill();
}
// Settings → Computer pilot: one Tech Lead agent may run throwaway sandbox tasks; off stops any running one.
function computerPilot(cp) {
  const techs = bots.filter((b) => b.role === "tech");
  const head = [
    "Computer pilot",
    "Needs Docker and the images from bot/pilot/setup.sh. Each task waits for your Approve, reads allowlisted test pages only, and the sandbox is deleted after. Turning this off stops a running task.",
  ];
  if (!techs.length)
    return sec(head, el("p", { class: "dim", style: { margin: "6px 0 0" } }, "Add a Tech Lead agent first."));
  const who = el(
    "select",
    { class: "f", "aria-label": "Computer pilot agent" },
    techs.map((b) => el("option", { value: b.id, selected: b.id === cp?.bot }, b.name)),
  );
  const on = el("input", { type: "checkbox", checked: !!cp?.enabled });
  const save = async (body) => {
    try {
      await api("/settings", { method: "POST", body });
    } catch (e) {
      toast(e.message);
      renderSettings();
    }
  };
  who.onchange = () => save({ computerBot: Number(who.value) });
  on.onchange = () => save({ computerBot: Number(who.value), computerEnabled: on.checked });
  return sec(
    head,
    el("label", { class: "k" }, "Agent"),
    who,
    el("label", { class: "toggle" }, on, el("div", {}, el("b", {}, "Propose sandbox tasks"))),
  );
}
// A settings section: [title, help?]; help hides behind a "?" (hover, focus or tap).
const tip = (t) =>
  el("button", { class: "tip", type: "button", title: t, "aria-label": t, onclick: () => toast(t) }, "?");
const sec = ([title, help], ...kids) =>
  el("section", { class: "sec" }, el("h3", {}, title, help && tip(help)), ...kids);
export async function loadBoard() {
  try {
    store.board = await api("/board");
    setBoard(store.board.ok);
  } catch {
    setBoard(false);
  }
}

// theme: system by default, chosen in Settings
const setTheme = (t) => {
  t ? (document.documentElement.dataset.theme = t) : delete document.documentElement.dataset.theme;
  try {
    localStorage.theme = t;
  } catch {}
};

export function initPanel() {
  icon($("sideClose"), "x").onclick = closeSide;
  icon($("sideBack"), "back").onclick = () => (store.current ? openSide("agent") : closeSide());
  icon($("panelBtn"), "panel").onclick = () => (store.panel === "agent" ? closeSide() : openSide("agent"));
  $("who").onclick = () => openSide("agent");
  icon($("newBtn"), "plus").onclick = openTo;
  icon($("searchIcon"), "search");
  icon($("backBtn"), "back").onclick = () => document.body.classList.remove("open");
  $("you").onclick = () => (store.panel === "settings" ? closeSide() : openSide("settings"));
  try {
    setTheme(localStorage.theme || "");
  } catch {}
}
