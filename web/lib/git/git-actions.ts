// Everything the Source control tab asks the server to do, one place: the same routes and payloads the old tab sent
// (/stage, /commit, /commit-message, /pr). A step that needs a second look opens its inline form or confirm first.
import { post, cardKey, host, toast } from "../core/index.ts";
import { DONE, type StepId } from "./git.ts";
import { getGit, gitUi, patchUi, resetUi, runOf, setGit, type GitAsk, type GitConfirm } from "./git-store.ts";

export type GitAct =
  | StepId
  | "go-pr"
  | "go-draft"
  | "go-merge"
  | "go-remove"
  | "stage"
  | "unstage"
  | "stageall"
  | "unstageall"
  | "discard"
  | "discardall"
  | "spark";
const ASKS = ["pr", "draft", "merge", "remove"];
export const ask = (a: GitAsk | undefined) => patchUi(cardKey(getGit().snap!.card), { ask: a });
export const fold = (k: string) => {
  const key = cardKey(getGit().snap!.card);
  patchUi(key, { shut: { ...gitUi(key).shut, [k]: !gitUi(key).shut[k] } });
};
// Resolves when the user answers the dialog the tab shows (components/git-confirm.tsx).
const confirm = (c: DistributiveOmit<GitConfirm, "ok" | "run">) =>
  new Promise<boolean>((ok) => setGit((s) => ({ confirm: { ...c, run: runOf(s), ok } as GitConfirm })));
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

// Draws the run again from the server, unless another card has opened in the panel meanwhile.
const refetch = async (key: string) => {
  const s = getGit().snap;
  if (s && cardKey(s.card) === key) await host.refetchRun(s.card);
};
const withBusy = async (id: string, fn: () => Promise<void>) => {
  setGit((s) => ({ busy: id, busyRun: runOf(s) }));
  try {
    await fn();
  } finally {
    setGit({ busy: null, busyRun: null });
  }
};

export async function gitAct(a: GitAct, path = "", untracked = false) {
  const snap = getGit().snap!,
    c = snap.card,
    key = cardKey(c),
    ui = gitUi(key),
    g = snap.git;
  if (ASKS.includes(a)) return ask(a as GitAsk);
  if (a === "spark")
    return withBusy("spark", async () => {
      const r = await post("/commit-message", { dir: c.state, id: c.id });
      if (r.ok) {
        patchUi(key, { msg: r.message });
        if (!r.ai) toast("Claude was not available: wrote a plain message");
      }
    });
  if (/stage|discard/.test(a)) {
    const op = a === "discardall" ? "discard" : a.replace("all", ""),
      paths =
        /all$/.test(a) && a !== "unstageall"
          ? (g.rows ?? []).filter((r) => !r.staged).map((r) => r.path)
          : a === "unstageall"
            ? (g.staged ?? [])
            : [path];
    if (a === "discard" && !(await confirm({ kind: "discard", path, untracked, many: 0 }))) return;
    if (
      a === "discardall" &&
      !(await confirm({ kind: "discard", path: paths.join("\n"), untracked: false, many: paths.length }))
    )
      return;
    return withBusy(a + ":" + path, async () => {
      await post("/stage", { dir: c.state, id: c.id, op, paths });
      await refetch(key);
    });
  }
  const msg = ui.msg ?? snap.msg;
  if ((a === "commit" || a === "commitpush") && !msg.trim()) return toast("A commit message is required");
  const base = { dir: c.state, id: c.id },
    [route, payload] =
      a === "commit"
        ? ["/commit", { ...base, message: msg, files: g.staged ?? [], push: false }]
        : a === "commitpush" || a === "push"
          ? ["/commit", { ...base, message: a === "commitpush" ? msg : "", files: g.files }]
          : a === "go-pr" || a === "go-draft"
            ? [
                "/pr",
                {
                  ...base,
                  op: "create",
                  title: ui.title ?? snap.title,
                  body: ui.body ?? `Run ${c.id}.`,
                  draft: a === "go-draft",
                },
              ]
            : ["/pr", { ...base, op: a === "go-merge" ? "merge" : "remove" }];
  return withBusy(a, async () => {
    let r = await post(route, payload);
    // The preflight stopped it: show what it found; a go-ahead resends with its one-time token.
    if (r.preflight && (await confirm({ kind: "preflight", pf: r.preflight })))
      r = await post(route, { ...payload, override: r.token });
    if (r.ok) {
      toast(DONE(a, r as any));
      resetUi(key);
    }
    await refetch(key);
  });
}
