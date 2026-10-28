import { store } from "./store.ts";
import { dirHeader } from "./api.ts";
import { open } from "./panel.ts";
import { key } from "./cards.ts";
import { go } from "./views.ts";

const box = () => document.getElementById("context")!;
const body = () => document.getElementById("context-body")!;
let tab = "files";
let folder = "";
let generation = 0;
let closeMobile = () => {};

const button = (label: string, action: () => void, cls = "tree-row") => {
  const el = document.createElement("button");
  el.className = cls;
  el.textContent = label;
  el.onclick = action;
  return el;
};
const message = (text: string) => {
  body().textContent = text;
};
const request = async (route: string) => {
  const response = await fetch(route, { headers: dirHeader() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || "Could not load this project");
  return data;
};
const selectedDir = () => store.dir || store.S.dir;

async function notes() {
  const gen = ++generation;
  message("Loading notes…");
  try {
    const data = await request("/vault?dir=" + encodeURIComponent(selectedDir() || ""));
    if (gen !== generation) return;
    body().replaceChildren();
    const list = data.notes.sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) return message("No notes in this project yet.");
    for (const note of list) {
      const link = document.createElement("a");
      link.className = "tree-row";
      link.style.paddingLeft = 8 + 10 * Math.min(note.name.split("/").length - 1, 4) + "px";
      link.textContent = note.name;
      link.href = "/notebook?dir=" + encodeURIComponent(data.dir) + "&note=" + encodeURIComponent(note.name);
      body().append(link);
    }
  } catch (error) {
    if (gen === generation) message(String(error));
  }
}

async function files(path = folder) {
  folder = path;
  const gen = ++generation;
  message("Loading files…");
  try {
    const data = await request(
      "/project-tree?dir=" + encodeURIComponent(selectedDir() || "") + "&path=" + encodeURIComponent(path),
    );
    if (gen !== generation) return;
    body().replaceChildren();
    if (path)
      body().append(button("← " + path, () => files(path.split("/").slice(0, -1).join("/")), "tree-row tree-back"));
    if (!data.entries.length) body().append("This folder is empty.");
    for (const entry of data.entries) {
      const next = path ? path + "/" + entry.name : entry.name;
      body().append(
        button(
          (entry.dir ? "▸ " : "   ") + entry.name,
          () => (entry.dir ? files(next) : file(next)),
          "tree-row" + (entry.dir ? " folder" : ""),
        ),
      );
    }
  } catch (error) {
    if (gen === generation) message(String(error));
  }
}

async function file(path: string) {
  const gen = ++generation;
  message("Loading file…");
  try {
    const data = await request(
      "/project-text?dir=" + encodeURIComponent(selectedDir() || "") + "&path=" + encodeURIComponent(path),
    );
    if (gen !== generation) return;
    body().replaceChildren();
    const actions = document.createElement("div");
    actions.className = "ctx-actions";
    actions.append(button("← Files", () => files(folder), "btn"));
    const download = document.createElement("a");
    download.className = "btn";
    download.textContent = "Download";
    download.href =
      "/project-text?dir=" +
      encodeURIComponent(selectedDir() || "") +
      "&path=" +
      encodeURIComponent(path) +
      "&download=1";
    actions.append(download);
    const title = document.createElement("strong");
    title.textContent = path;
    const pre = document.createElement("pre");
    pre.textContent = data.content;
    body().append(actions, title, pre);
  } catch (error) {
    if (gen === generation) message(String(error));
  }
}

function terminals() {
  ++generation;
  body().replaceChildren();
  body().append(
    button(
      "Open terminal workspace",
      () => {
        if (!matchMedia("(min-width:1201px)").matches) closeMobile();
        tab = "files";
        render();
        go("terminal", true);
      },
      "btn",
    ),
  );
  const sessions = store.S.cards.filter((c) => c.pty && !c.archived);
  if (!sessions.length) {
    const empty = document.createElement("p");
    empty.textContent = "No terminal sessions yet.";
    body().append(empty);
    return;
  }
  for (const card of sessions)
    body().append(
      button((card.pty.alive ? "● " : "○ ") + (card.id || String(card.text).split("\n")[0]), () => {
        store.wantTerm = key(card);
        if (!matchMedia("(min-width:1201px)").matches) closeMobile();
        open(card);
      }),
    );
}

function render() {
  const dir = selectedDir();
  document.getElementById("context-title")!.textContent = dir
    ? dir.split(/[\\/]/).filter(Boolean).at(-2) || "Project"
    : "Project";
  box()
    .querySelectorAll<HTMLButtonElement>("[data-context]")
    .forEach((el) => {
      el.classList.toggle("on", el.dataset.context === tab);
      el.setAttribute("aria-pressed", String(el.dataset.context === tab));
    });
  if (tab === "notes") void notes();
  else if (tab === "files") void files();
  else terminals();
}

export function initContext() {
  const wide = matchMedia("(min-width:1201px)");
  const opener = document.getElementById("ctx-open")!;
  const setOpen = (value: boolean) => {
    const modal = value && !wide.matches;
    box().classList.toggle("on", value);
    opener.setAttribute("aria-expanded", String(value));
    box().setAttribute("role", wide.matches ? "complementary" : "dialog");
    if (modal) box().setAttribute("aria-modal", "true");
    else box().removeAttribute("aria-modal");
    document.querySelector<HTMLElement>(".rail")!.inert = modal;
    for (const child of document.querySelector<HTMLElement>(".app")!.children)
      if (child !== box()) (child as HTMLElement).inert = modal;
  };
  closeMobile = () => setOpen(false);
  const sync = () => {
    setOpen(wide.matches);
  };
  wide.addEventListener("change", () => {
    sync();
    if (wide.matches) render();
  });
  sync();
  opener.onclick = () => {
    const next = !box().classList.contains("on");
    setOpen(next);
    if (next) {
      render();
      if (!wide.matches) box().querySelector<HTMLElement>("[data-context].on")?.focus();
    }
  };
  document.getElementById("ctx-close")!.onclick = () => {
    setOpen(false);
    opener.focus();
  };
  addEventListener(
    "keydown",
    (event) => {
      if (wide.matches || !box().classList.contains("on")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        opener.focus();
      } else if (event.key === "Tab") {
        const items = [...box().querySelectorAll<HTMLElement>("button,a[href]")].filter(
          (item) => !item.hasAttribute("disabled") && item.getClientRects().length,
        );
        const first = items[0],
          last = items.at(-1);
        if (!first || !last) return;
        if (
          !box().contains(document.activeElement) ||
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    },
    true,
  );
  addEventListener("kz-view", () => {
    if (!wide.matches) setOpen(false);
  });
  box()
    .querySelectorAll<HTMLButtonElement>("[data-context]")
    .forEach(
      (el) =>
        (el.onclick = () => {
          tab = el.dataset.context!;
          render();
        }),
    );
  let lastDir = selectedDir();
  addEventListener("kz-state", () => {
    const now = selectedDir();
    if (now !== lastDir) {
      lastDir = now;
      folder = "";
      if (box().classList.contains("on")) render();
    } else if (box().classList.contains("on") && tab === "terminal") terminals();
  });
  render();
}
