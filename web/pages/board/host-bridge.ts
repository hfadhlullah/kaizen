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
import { cardHref, gitProjects, isHomeDir, wsHref } from "@lib/rail";
import { openHomeTerm, startHomeFrom } from "@lib/home";
import { navigateTask } from "@lib/task";
import { pick as pickProject } from "@lib/project";
import { rich } from "@lib/notes";
import { dataUrls } from "@lib/shared";
import { close as closePanel, getPanel, open as openPanel, openAt, openRun, openTabIn, openTermIn, openWorkspace, openWsIn, work } from "@lib/run";

// A card's run or task, in place. A card of another project switches the board to that project first; one the board does not
// have (not loaded, or another project) is false, and the caller changes the address.
function openCardIn({ dir, id, text }: { dir: string; id?: string; text?: string }) {
  const find = () =>
    getServer().state.cards.find(
      (x: any) => x.state === dir && (id ? x.kind === "run" && x.id === id : x.kind === "idea" && x.text === text),
    );
  const c = find();
  if (c) return openWorkspace(c), true;
  if (!dir || dir === getServer().dir) return false;
  const href = cardHref({ state: dir, kind: id ? "run" : "idea", id, text });
  pickProject(dir)
    .then(() => {
      const c = find();
      if (c) openWorkspace(c);
      else location.href = href;
    })
    .catch(() => (location.href = href));
  return true;
}

export function initHost() {
  startTerminalDictation();
  setHost({
    open: {
      card: openCardIn,
      ws: ({ dir, ws }) => (openWsIn(dir, ws), true),
      // A Home terminal opens in the Home window (full screen on a phone); any other in its workspace.
      term: (a) => {
        if (isHomeDir(a.dir)) openHomeTerm(String(a.key ?? ""));
        else openTermIn({ dir: a.dir ?? "", ws: a.ws ?? "", key: a.key });
        return true;
      },
      tab: (a) => (openTabIn(a), true),
      task: (a) => (navigateTask(a), true),
      homeStart: (a) => (startHomeFrom(a), true),
    },
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
