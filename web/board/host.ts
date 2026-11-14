// What the React pages need from the board's old code, handed over once at start: the toaster, the host functions
// (lib/core/host.ts: go, newTask, openCard, ...) and the terminal dictation keys. The
// pages never import web/board; this is the one place the two meet.
import { setHost, toast } from "@lib/core";
import { navigate } from "@lib/router";
import { dirHeader, load } from "./api.ts";
import { startTerminalDictation } from "@lib/dictation";
import { FONT_MAX, FONT_MIN, fontRead, fontSet } from "../term/term-font.ts";
import { key, newTask, runPopup, via } from "./cards.ts";
import { open as openPanel, openAt, close as closePanel, openRun } from "./panel.ts";
import { openWorkspace } from "./run-view.ts";
import { rich } from "./rich.ts";
import { askNotify, notifyOn, playSound, setToaster, SOUNDS, soundPick } from "./toast.ts";
import { dataUrls, motion } from "./dom.ts";
import { pick as pickProject, setShown, showable } from "./projects.ts";
import { gitProjects, wsHref } from "./workspace.ts";
import { store } from "./store.ts";

export function initHost() {
  setToaster(toast);
  startTerminalDictation();
  setHost({
    go: navigate,
    newTask: () => newTask(),
    runPopup,
    scopeDir: () => (!store.all ? (store.S.dir ?? "") : ""),
    dirHeader,
    projects: () => store.S.projects,
    showable,
    shown: () => store.shown,
    clearShown: () => {
      store.shown.clear();
      setShown();
    },
    toggleShown: (d) => {
      store.shown.has(d) ? store.shown.delete(d) : store.shown.add(d);
      setShown();
    },
    reload: () => void load(),
    dataUrls,
    rich,
    pop: () => soundPick() !== "off" && playSound("pop"),
    motion,
    agentLine: via,
    openCard: (c, tab, item) => (item != null ? openAt(c, tab === "backlog" ? "backlog" : "finding", item) : openPanel(c)),
    openWorkspace,
    loadBoard: () => load(),
    launched: (c, pty) => {
      if (!pty) return;
      store.wantTerm = key(c);
      store.wantPty = { key: pty, at: Date.now() };
    },
    closePanel,
    reopenPanel: (c) => void openRun(c, true),
    refetchRun: (c) => openRun(c, false),
    gitTab: (c) => {
      store.tab = "git";
      void openRun(c, true);
    },
    panelOpenFor: (c) => store.openKey === key(c),
    notify: askNotify,
    font: { min: FONT_MIN, max: FONT_MAX, read: fontRead, set: fontSet },
    notices: { on: notifyOn, sounds: SOUNDS, sound: soundPick, play: (n) => playSound(n) },
    currentDir: () => store.dir || store.S?.dir || "",
    gitProjects,
    runCards: () => store.S.cards.filter((c) => c.kind === "run"),
    wsHref,
    pickProject,
    openSettings: (q) => {
      store.setQ = q;
      navigate("settings", true);
    },
  });
}
