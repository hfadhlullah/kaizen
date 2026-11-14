// What a tap on the phone's Home does: open an agent's terminal, pick one of a workspace's agents, start a new one.
// The two sheets (phone-sheet.ts) get what each row shows and does; the runs and projects are the side menu's data.
import { host, toast } from "@lib/core";
import { DOT, projName, useRail, WORD, type Agent } from "@lib/rail";
import { wsKey } from "@lib/run";
import { agentGroups, wsName, type AgentRow } from "./phone-home.ts";
import { openSheet } from "./phone-sheet.ts";

// A Home terminal opens in the Home window; any other goes to its workspace.
export function openTerm(a: Agent) {
  if (
    dispatchEvent(new CustomEvent("kz-open-term", { cancelable: true, detail: { dir: a.dir, ws: a.ws, key: a.key } }))
  )
    location.href = host.wsHref(a.dir, a.ws ?? "");
}
// Several agents in a workspace: a sheet picks which terminal to open.
export function pickAgent(rows: AgentRow[]) {
  openSheet({
    kind: "pick",
    title: wsName(rows[0]!.a),
    rows: rows.map(({ a, st }) => ({
      agent: a.agent || "",
      name: a.name || a.agent || "Terminal",
      dot: DOT[st],
      word: WORD[st],
      open: () => openTerm(a),
    })),
    onNew: () => void newSheet(rows[0]!.a.dir, rows[0]!.a.ws),
  });
}

// New: pick a workspace, then an agent or a plain shell. It starts as a tab of that workspace, the same POST the
// workspace's own + button makes.
export async function newSheet(dir?: string, ws?: string) {
  const { projects, agents } = useRail.getState().data;
  const spots = (projects ?? []).flatMap((p) =>
    (p.workspaces ?? []).map((w) => ({
      dir: p.dir as string,
      ws: w.path as string,
      name: w.branch || w.path.split(/[\\/]/).pop(),
    })),
  );
  const first = agentGroups(agents ?? [], Date.now())[0]?.rows[0]?.a;
  // Home (no project) is listed first; it is picked when no project workspace is in view.
  const on = spots.find((x) => x.dir === (dir ?? first?.dir) && x.ws === (ws ?? first?.ws)) ?? null;
  const list = await fetch(on ? "/agents?dir=" + encodeURIComponent(on.dir) : "/agents?home=1").then(
    (r) => r.json(),
    () => null,
  );
  const kinds: { cmd: string; name: string; yolo?: boolean }[] = [...(list?.agents ?? []), { cmd: "", name: "Shell" }];
  openSheet({
    kind: "new",
    spots: spots.map((x) => ({ name: `${projName(x.dir, projects)} ${x.name}` })),
    on: on ? spots.indexOf(on) : -1,
    kinds: kinds.map((k) => ({ agent: k.cmd, name: k.name })),
    yolo: !!list?.agents?.find((a) => a.cmd === list.default)?.bypassDefault,
    start: async (pick, i, yolo) => {
      const kind = kinds[i]!,
        cmd = kind.cmd;
      // Home: the Home window starts it (POST /shell {home:true}) and opens full screen.
      if (pick < 0)
        return void dispatchEvent(
          new CustomEvent("kz-home-start", { detail: { agent: cmd, yolo: !!kind.yolo && yolo } }),
        );
      const at = spots[pick]!;
      const r = await fetch("/shell", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dir: at.dir,
          ws: at.ws,
          run: wsKey(at.dir, at.ws),
          ...(cmd ? { agent: cmd, yolo: !!kind.yolo && yolo } : {}),
        }),
      }).catch(() => null);
      const sh = r?.ok ? await r.json() : null;
      if (sh) openTerm({ dir: at.dir, ws: at.ws, key: sh.key } as Agent);
      else toast("No new terminal: " + ((await r?.json().catch(() => null))?.error || "kaizen did not answer"));
    },
  });
}
