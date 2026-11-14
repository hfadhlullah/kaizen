// What the React pages need from the board's engines, handed over once at start: the host functions (lib/core/host.ts:
// go, newTask, openCard, ...) and the terminal dictation keys. Lib and components call the host, never a page; this is the one
// place the two meet.
import { motion, setHost } from "@lib/core";
import { askNotify, notifyOn, playSound, SOUNDS, soundPick } from "@lib/core";
import { navigate } from "@lib/router";
import { cardKey as key, dirHeader, getServer, load } from "@lib/server";
import { startTerminalDictation } from "@lib/dictation";
import { FONT_MAX, FONT_MIN, fontRead, fontSet } from "@lib/terminal";
import { newTask, runPopup, via } from "@lib/board";
import { gitProjects, wsHref } from "@lib/rail";
import { pick as pickProject } from "@lib/project";
import { rich } from "@lib/notes";
import { dataUrls } from "@lib/shared";
import { close as closePanel, getPanel, open as openPanel, openAt, openRun, openWorkspace, work } from "@lib/run";

export function initHost() {
  startTerminalDictation();
  setHost({
    go: navigate,
    newTask: () => newTask(),
    runPopup,
    scopeDir: () => (!getServer().all ? (getServer().state.dir ?? "") : ""),
    dirHeader,
    projects: () => getServer().state.projects,
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
      work.wantTerm = key(c);
      work.wantPty = { key: pty, at: Date.now() };
    },
    closePanel,
    reopenPanel: (c) => void openRun(c, true),
    refetchRun: (c) => openRun(c, false),
    gitTab: (c) => {
      work.tab = "git";
      void openRun(c, true);
    },
    panelOpenFor: (c) => getPanel().openKey === key(c),
    notify: askNotify,
    font: { min: FONT_MIN, max: FONT_MAX, read: fontRead, set: fontSet },
    notices: { on: notifyOn, sounds: SOUNDS, sound: soundPick, play: (n) => playSound(n) },
    currentDir: () => getServer().dir || getServer().state?.dir || "",
    gitProjects,
    runCards: () => getServer().state.cards.filter((c) => c.kind === "run"),
    wsHref,
    pickProject,
    openSettings: (q) => {
      work.setQ = q;
      navigate("settings", true);
    },
  });
}
