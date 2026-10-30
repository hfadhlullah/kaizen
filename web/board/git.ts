import { store } from "./store.ts";
import { post } from "./api.ts";
import { key } from "./cards.ts";
import { $, html, raw, modal } from "./dom.ts";
import { commitMsg } from "./markdown.ts";
import { openRun } from "./panel.ts";
import { toast } from "./toast.ts";

// The run's Source control tab, laid out like Orca's: the branch and its pull request at
// the top, the commit message, one split button (Stage all, then Commit) with every other
// step in its menu, each unavailable one saying why, the run's staged and unstaged files
// with their line counts, and the branch's commits at the foot. A run built in the
// project's own checkout (no worktree) only commits and pushes.

// What the user typed and which inline confirm is open, per run: a refresh redraws the tab.
const ui = new Map<string, { msg?: string; title?: string; body?: string; draft?: boolean; ask?: string; shut?: Record<string, boolean> }>();
const st = (c) => {
  let u = ui.get(key(c));
  if (!u) ui.set(key(c), (u = {}));
  return u;
};

// Commits only after the final approval, and only on a finished run.
export const gitShown = (c) => {
  const g = store.runDoc && store.runDoc.git;
  return (
    !!(g && g.repo) && !c.archived && c.accept !== "needs" && (c.status === "done" || c.awaiting === "approvals.review")
  );
};
// Something is left to do: the footer points at the tab.
export const gitPending = (c) => {
  if (!gitShown(c)) return false;
  const g = store.runDoc.git,
    b = store.runDoc.branch;
  return (
    g.files.length > 0 ||
    (b
      ? (b.upstream && g.ahead > 0) ||
        (b.pr && b.pr.state === "OPEN") ||
        (b.landed && !b.pr) ||
        (b.pr && b.pr.state === "MERGED")
      : g.ahead > 0)
  );
};

// Every step, in the order the primary button walks them. `why` is set when the step is
// unavailable; the menu shows it under the label, as Orca does.
function steps(c) {
  const g = store.runDoc.git,
    b = store.runDoc.branch,
    pr = b && b.pr,
    files = g.files.length,
    staged = (g.staged || []).length,
    open = pr && pr.state === "OPEN";
  const s = [
    { a: "commit", label: "Commit", why: staged ? "" : files ? "Stage changes first" : "No changes to commit" },
    { a: "commitpush", label: "Commit & push", why: files ? "" : "No changes to commit" },
    {
      a: "push",
      label: "Push",
      why: files
        ? "Commit changes first"
        : b && !b.upstream
          ? "Not published yet: Create PR pushes it"
          : g.ahead > 0
            ? ""
            : "Nothing to push",
    },
  ];
  if (!b) return s;
  const noGh = b.gh ? "" : "Needs the GitHub CLI (gh) and a GitHub remote";
  const prWhy =
    noGh ||
    (files
      ? "Commit changes first"
      : pr && pr.state !== "CLOSED"
        ? `Pull request #${pr.number} is ${pr.state === "MERGED" ? "merged" : "open"}`
        : "");
  s.push(
    { a: "pr", label: b.upstream && g.ahead === 0 ? "Create PR" : "Push & create PR", why: prWhy },
    { a: "draft", label: "Create draft PR", why: prWhy },
    {
      a: "merge",
      label: "Merge PR",
      why:
        noGh ||
        (!open
          ? "No open pull request"
          : pr.draft
            ? "Draft: mark it ready on GitHub first"
            : files
              ? "Commit changes first"
              : g.ahead > 0
                ? "Push first"
                : ""),
    },
    {
      a: "remove",
      label: "Remove workspace",
      why: files ? "Commit or discard the changes first" : b.landed ? "" : "Merge the pull request first",
    },
  );
  return s;
}

const PR_WORD = { OPEN: "Open", MERGED: "Merged", CLOSED: "Closed" };

// Small inline icons Orca's panel uses that the board's sprite does not have.
const ICO = {
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
};
const sum = (rows) => rows.reduce((t, r) => [t[0] + r.add, t[1] + r.del], [0, 0]);
const counts = ([a, d]) => (a || d ? html`<span class="gnum"><i class="ad">+${a}</i><i class="de">-${d}</i></span>` : "");

export function gitTab(c, refresh) {
  const body = $("pbody");
  // A refresh while the user types or a step runs would lose the text or the busy label.
  if (
    refresh &&
    body.querySelector(".gitp") &&
    (body.querySelector(".gitp [data-busy]") || body.querySelector(".gitp")!.contains(document.activeElement))
  )
    return;
  const g = store.runDoc.git,
    b = store.runDoc.branch,
    pr = b && b.pr,
    u = st(c),
    all = steps(c),
    rows = g.rows || [],
    staged = rows.filter((r) => r.staged),
    unstaged = rows.filter((r) => !r.staged),
    target = b ? `origin/${b.base}` : `${g.remote}/${g.branch || "HEAD"}`;
  if (u.msg === undefined) u.msg = commitMsg(store.runDoc.impl) || c.title || c.text || "";
  u.shut = u.shut || {};
  // The main button: Stage all while nothing is staged, Commit once something is, else the
  // next remote step (push, PR, merge, remove), else a Commit with nothing to do.
  const later = all.find((x) => !x.why && !["commit", "commitpush", "draft"].includes(x.a));
  const main = staged.length
    ? { a: "commit", label: "Commit", ico: ICO.check }
    : unstaged.length
      ? { a: "stageall", label: "Stage all", ico: ICO.plus }
      : later
        ? { a: later.a, label: later.label, ico: "" }
        : { a: "", label: "Commit", ico: ICO.check };
  const chip = pr
    ? html`<a class="gchip ${pr.state.toLowerCase()}${pr.draft ? " draft" : ""}" href="${pr.url}" target="_blank" rel="noopener" title="Open on GitHub"
        ><svg><use href="#t-git" /></svg>#${pr.number} ${pr.draft && pr.state === "OPEN" ? "Draft" : PR_WORD[pr.state] || pr.state}</a
      >`
    : b && b.checking
      ? html`<span class="gchip dim">Checking PR…</span>`
      : b && b.gh && !all.find((x) => x.a === "pr").why
        ? html`<button class="gchip" data-a="pr"><svg><use href="#t-git" /></svg>Create PR</button>`
        : "";
  const row = (r) => {
    const i = r.path.lastIndexOf("/"),
      name = r.path.slice(i + 1),
      dir = i > 0 ? r.path.slice(0, i) : "";
    return html`<li class="grow" title="${r.path}">
      <span class="gico">${raw(ICO.file)}</span><span class="gname">${name}${dir ? html`<small>${dir}</small>` : ""}</span>
      <span class="gside">
      <span class="gacts">${raw(
        r.staged
          ? html`<button class="ib" data-a="unstage" data-p="${r.path}" title="Unstage" aria-label="Unstage ${r.path}">${raw(ICO.minus)}</button>`
          : html`<button class="ib" data-a="discard" data-p="${r.path}" data-u="${r.code === "U" ? 1 : ""}" title="Discard changes" aria-label="Discard changes to ${r.path}">${raw(ICO.undo)}</button><button class="ib" data-a="stage" data-p="${r.path}" title="Stage" aria-label="Stage ${r.path}">${raw(ICO.plus)}</button>`,
      )}</span>
      <span class="gmeta">${counts([r.add, r.del])}<span class="gcode c-${r.code}">${r.code}</span></span>
      </span>
    </li>`;
  };
  const group = (k, title, list) =>
    list.length
      ? html`<section class="ggrp${u.shut[k] ? " shut" : ""}">
          <div class="ghd">
            <button class="gtog" data-a="tog" data-k="${k}" aria-expanded="${!u.shut[k]}">${raw(ICO.chev)}${title} <span class="n">${list.length}</span></button>
            <span class="gacts on">${raw(
              k === "staged"
                ? html`<button class="ib" data-a="unstageall" title="Unstage all" aria-label="Unstage all">${raw(ICO.minus)}</button>`
                : html`<button class="ib" data-a="discardall" title="Discard all changes" aria-label="Discard all changes">${raw(ICO.undo)}</button><button class="ib" data-a="stageall" title="Stage all" aria-label="Stage all">${raw(ICO.plus)}</button>`,
            )}</span>
          </div>
          <ul class="glist">${raw(list.map(row).join(""))}</ul>
        </section>`
      : "";
  const noChange = !rows.length
    ? html`<div class="gempty">
        <b>${pr && pr.state === "MERGED" ? "Merged" : b && b.landed ? "On " + b.base : g.ahead > 0 && (!b || b.upstream) ? "Not pushed yet" : "No changes on this branch"}</b>
        <span>${
          pr && pr.state === "MERGED"
            ? `Pull request #${pr.number} is merged into ${b.base}. The worktree and its branch can go.`
            : b && b.landed
              ? `Every commit of ${b.branch} is on ${b.base}. The worktree can go.`
              : g.ahead > 0 && (!b || b.upstream)
                ? `${g.ahead} commit${g.ahead === 1 ? "" : "s"} ahead of ${target}.`
                : b && !b.upstream
                  ? `${b.branch} is not on GitHub yet. Create PR pushes it.`
                  : `This workspace is clean and has no changes ahead of ${target}.`
        }</span>
      </div>`
    : "";
  // What Orca has no room for: files that are other runs', said on hover of the totals.
  const aside = [g.others ? `${g.others} other changed file${g.others === 1 ? " is" : "s are"} not this run's` : "", ...(g.shared && g.shared.length ? [`Also holds other runs' changes: ${g.shared.map((x) => x.split(":")[0]).join(", ")}`] : [])].filter(Boolean).join("\n");
  // The inline confirm or form the last click opened, in place of the split button.
  const ask =
    u.ask === "pr" || u.ask === "draft"
      ? html`<div class="gsec gform">
          <div class="ghd">${u.ask === "draft" ? "Draft pull request" : "Pull request"} into ${b.base}</div>
          <input id="gtitle" aria-label="Title" value="${u.title ?? (commitMsg(store.runDoc.impl) || c.title || "").split("\n")[0]}" /><textarea id="gbody" aria-label="Description">${u.body ?? `Run ${c.id}.`}</textarea>
          <div class="row">
            <button class="btn ghost" data-a="cancel">Cancel</button
            ><button class="btn pri" data-a="go-${u.ask}">${b.upstream && g.ahead === 0 ? "" : "Push & "}${u.ask === "draft" ? "create draft PR" : "create PR"}</button>
          </div>
        </div>`
      : u.ask === "merge"
        ? html`<div class="gsec gform">
            <div class="ghd">Merge #${pr.number} into ${b.base} by rebase?</div>
            <div class="row"><button class="btn ghost" data-a="cancel">Cancel</button><button class="btn pri" data-a="go-merge">Merge PR</button></div>
          </div>`
        : u.ask === "remove"
          ? html`<div class="gsec gform">
              <div class="ghd">Remove the worktree and delete ${b.branch}?</div>
              <div class="dim">Its work is on ${b.base}. The branch is deleted here and on GitHub.</div>
              <div class="row"><button class="btn ghost" data-a="cancel">Cancel</button><button class="btn danger" data-a="go-remove">Remove workspace</button></div>
            </div>`
          : "";
  const menu = all
    .map((x) => html`<button data-a="${x.a}" ${x.why ? " disabled" : ""}><span>${x.label}</span>${x.why ? html`<small>${x.why}</small>` : ""}</button>`)
    .concat(pr ? [html`<hr /><a href="${pr.url}" target="_blank" rel="noopener">Open PR on GitHub</a>`] : []);
  const split = ask
    ? ""
    : html`<div class="split gsplit">
        <button class="btn" data-a="${main.a}" ${main.a ? "" : " disabled"}>${raw(main.ico)}${main.label}</button
        ><button class="btn gmore" aria-label="More commit and remote actions" title="More commit and remote actions" aria-haspopup="menu"><svg><use href="#i-chev" /></svg></button>
        <div class="menu-pop" role="menu" hidden>${raw(menu.join(""))}</div>
      </div>`;
  const log = g.log || [];
  const commits = log.length
    ? html`<section class="glog${u.shut.log ? " shut" : ""}">
        <div class="ghd"><button class="gtog" data-a="tog" data-k="log" aria-expanded="${!u.shut.log}">${raw(ICO.chev)}Commits <span class="n">${log.length}${log.length >= 50 ? "+" : ""}</span></button></div>
        <ol class="gcommits">${raw(
          log
            .map((l, i) => {
              const head = i === 0 && (b ? b.branch : g.branch);
              return html`<li class="${i === 0 ? "head" : ""}${l.unpushed ? " up" : ""}" title="${l.sha}${l.unpushed ? " (not pushed)" : ""}"><i></i><span>${l.subject}</span>${head ? html`<em>${head}</em>` : ""}</li>`;
            })
            .join(""),
        )}</ol>
      </section>`
    : "";
  body.innerHTML = html`<div class="gitp">
    <div class="ghead">
      ${chip}
      <div class="gbr" title="${aside || g.branch}"><span>${b ? b.branch : g.branch || "HEAD"}</span>${counts(sum(rows))}</div>
      <div class="gto">→ ${target}${pr ? html`<a class="ib" href="${pr.url}" target="_blank" rel="noopener" title="Open on GitHub" aria-label="Open on GitHub"><svg><use href="#i-ext" /></svg></a>` : ""}</div>
    </div>
    ${rows.length ? html`<div class="gmsgbox"><textarea id="gmsg" aria-label="Commit message" placeholder="Message">${u.msg}</textarea><button class="ib gspark" data-a="spark" title="Write a commit message from the changes" aria-label="Write a commit message from the changes"><svg><use href="#i-ai" /></svg></button></div><div class="dim" id="glong" hidden>First line over 72 characters.</div>` : ""}
    ${noChange}${ask}${split}
    ${group("staged", "Staged changes", staged)}${group("changes", "Changes", unstaged)}
    ${commits}
  </div>`;
  wire(c, body.querySelector(".gitp"));
}

// Orca's confirm: the file named, Cancel or a red Discard. Resolves true on Discard.
function confirmDiscard(path, untracked, many = 0) {
  return new Promise((res) => {
    const dl = modal(html`<div class="gdis">
      <b>${many ? `Discard all ${many} unstaged changes?` : html`Discard changes to "${path.split("/").pop()}"?`}</b>
      <p>${many ? "This reverts every unstaged file below; new files are deleted." : untracked ? "This will delete this new file." : "This will revert the unstaged changes to this file."} This cannot be undone.</p>
      <div class="gpath">${path}</div>
      <div class="row"><button class="btn" value="no">Cancel</button><button class="btn danger" value="yes">${raw(ICO.undo)}Discard</button></div>
    </div>`);
    dl.addEventListener("close", () => res(dl.returnValue === "yes"));
  });
}

function wire(c, el) {
  const u = st(c),
    inp = el.querySelector("#gmsg");
  if (inp) {
    const fit = () => {
      inp.style.height = "auto";
      inp.style.height = Math.min(inp.scrollHeight + 2, innerHeight / 2) + "px";
      $("glong").hidden = inp.value.split("\n")[0].length <= 72;
    };
    inp.oninput = () => {
      u.msg = inp.value;
      fit();
    };
    fit();
  }
  el.querySelector("#gtitle")?.addEventListener("input", (e) => (u.title = e.target.value));
  el.querySelector("#gbody")?.addEventListener("input", (e) => (u.body = e.target.value));
  const more = el.querySelector(".gmore"),
    pop = el.querySelector(".gsplit .menu-pop");
  if (more)
    more.onclick = (e) => {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
      if (!pop.hidden) addEventListener("click", () => (pop.hidden = true), { once: true });
    };
  el.querySelectorAll("[data-a]").forEach((b) => {
    if (!b.dataset.a) return;
    b.onclick = () => act(c, b.dataset.a, b);
  });
}

const BUSY = {
  commit: "Committing…",
  commitpush: "Pushing…",
  push: "Pushing…",
  "go-pr": "Creating PR…",
  "go-draft": "Creating PR…",
  "go-merge": "Merging…",
  "go-remove": "Removing…",
};

async function act(c, a, b) {
  const u = st(c);
  if (a === "cancel") return ((u.ask = undefined), gitTab(c, false));
  // Steps that need a second look open their form or confirm first.
  if (a === "pr" || a === "draft" || a === "merge" || a === "remove") return ((u.ask = a), gitTab(c, false));
  if (a === "tog") {
    u.shut = { ...u.shut, [b.dataset.k]: !u.shut?.[b.dataset.k] };
    return gitTab(c, false);
  }
  const g = store.runDoc.git;
  if (a === "spark") {
    b.disabled = true;
    b.dataset.busy = 1;
    b.classList.add("spin");
    const r = await post("/commit-message", { dir: c.state, id: c.id });
    b.classList.remove("spin");
    delete b.dataset.busy;
    if (r.ok) {
      u.msg = r.message;
      if (!r.ai) toast("Claude was not available: wrote a plain message");
    }
    if (store.openKey === key(c)) gitTab(c, false);
    return;
  }
  if (a === "stage" || a === "unstage" || a === "stageall" || a === "unstageall" || a === "discard" || a === "discardall") {
    const open = (g.rows || []).filter((r) => !r.staged);
    const paths =
      a === "stageall" || a === "discardall"
        ? open.map((r) => r.path)
        : a === "unstageall"
          ? g.staged || []
          : [b.dataset.p];
    if (a === "discard" && !(await confirmDiscard(b.dataset.p, !!b.dataset.u))) return;
    if (a === "discardall" && !(await confirmDiscard(paths.join("\n"), false, paths.length))) return;
    b.disabled = true;
    b.dataset.busy = 1;
    const r = await post("/stage", { dir: c.state, id: c.id, op: a === "discardall" ? "discard" : a.replace("all", ""), paths });
    delete b.dataset.busy;
    if (store.openKey === key(c)) await openRun(c, false, true);
    return;
  }
  if ((a === "commit" || a === "commitpush") && !(u.msg || "").trim()) return toast("A commit message is required");
  b.disabled = true;
  b.dataset.busy = 1;
  b.textContent = BUSY[a] || "Working…";
  const base = { dir: c.state, id: c.id };
  const r =
    a === "commit"
      ? await post("/commit", { ...base, message: u.msg, files: g.staged || [], push: false })
      : a === "commitpush" || a === "push"
      ? await post("/commit", { ...base, message: a === "commitpush" ? u.msg : "", files: g.files })
      : a === "go-pr" || a === "go-draft"
        ? await post("/pr", {
            ...base,
            op: "create",
            title: u.title ?? $("gtitle").value,
            body: u.body ?? $("gbody").value,
            draft: a === "go-draft",
          })
        : await post("/pr", { ...base, op: a === "go-merge" ? "merge" : "remove" });
  if (r.ok) {
    toast(
      a === "commit"
        ? "Committed " + r.sha
        : a === "commitpush" || a === "push"
        ? "Committed & pushed " + r.sha
        : a === "go-merge"
          ? "Merged"
          : a === "go-remove"
            ? "Worktree removed"
            : "Pull request #" + r.pr.number + " opened",
    );
    ui.delete(key(c));
  }
  if (store.openKey !== key(c)) return;
  delete b.dataset.busy;
  await openRun(c, false);
}
