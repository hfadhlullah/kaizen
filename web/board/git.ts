import { store } from "./store.ts";
import { post } from "./api.ts";
import { key } from "./cards.ts";
import { $, html, raw } from "./dom.ts";
import { commitMsg } from "./markdown.ts";
import { openRun } from "./panel.ts";
import { toast } from "./toast.ts";

// The run's Git tab, laid out like Orca's Source Control panel: the branch and its pull
// request at the top, the run's changed files and the message, then one split button
// whose label is the next step (commit, push, open the PR, merge it, remove the worktree)
// with the other steps in its menu, each unavailable one saying why. A run built in the
// project's own checkout (no worktree) only commits and pushes.

// What the user typed and which inline confirm is open, per run: a refresh redraws the tab.
const ui = new Map<string, { msg?: string; title?: string; body?: string; draft?: boolean; ask?: string }>();
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
    open = pr && pr.state === "OPEN";
  const s = [
    { a: "commit", label: "Commit & push", why: files ? "" : "No changes to commit" },
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
    next = all.find((x) => !x.why && x.a !== "draft"),
    files = g.files.length,
    target = b ? `origin/${b.base}` : `${g.remote}/${g.branch || "HEAD"}`;
  if (u.msg === undefined) u.msg = commitMsg(store.runDoc.impl) || c.title || c.text || "";
  const chip = pr
    ? html`<a
        class="gchip ${pr.state.toLowerCase()}${pr.draft ? " draft" : ""}"
        href="${pr.url}"
        target="_blank"
        rel="noopener"
        title="Open on GitHub"
        ><svg><use href="#t-git" /></svg>#${pr.number}
        ${pr.draft && pr.state === "OPEN" ? "Draft" : PR_WORD[pr.state] || pr.state}</a
      >`
    : b && b.checking
      ? html`<span class="gchip dim">Checking PR…</span>`
      : b && b.gh && !all.find((x) => x.a === "pr").why
        ? html`<button class="gchip" data-a="pr">
            <svg><use href="#t-git" /></svg>Create PR
          </button>`
        : "";
  const k = store.runDoc.commit;
  const empty = files
    ? ""
    : html`<div class="gempty">
        <b
          >${pr && pr.state === "MERGED" ? "Merged" : b && b.landed ? "On " + b.base : g.ahead > 0 && (!b || b.upstream) ? "Not pushed yet" : "No changes to commit"}</b
        ><span
          >${
            pr && pr.state === "MERGED"
              ? `Pull request #${pr.number} is merged into ${b.base}. The worktree and its branch can go.`
              : b && b.landed
                ? `Every commit of ${b.branch} is on ${b.base}. The worktree can go.`
                : g.ahead > 0 && (!b || b.upstream)
                  ? `${g.ahead} commit${g.ahead === 1 ? "" : "s"} ahead of ${target}.`
                  : pr && pr.state === "OPEN"
                    ? `Pull request #${pr.number} is open against ${b.base}.`
                    : b && !b.upstream
                      ? `${b.branch} is not on GitHub yet. Create PR pushes it and opens the pull request.`
                      : `Up to date with ${target}.`
          }</span
        >${k && k.sha ? html`<span class="dim">Last commit <code>${k.sha}</code>${k.pushed ? " pushed" : " not pushed"}.</span>` : ""}
      </div>`;
  const changes = files
    ? html`<div class="gsec">
        <div class="ghd">Changes <span class="n">${files}</span></div>
        <pre class="files">${g.files.join("\n")}</pre>
        ${g.others ? html`<div class="dim">${g.others} other changed file${g.others === 1 ? " is" : "s are"} left alone: they are not this run's.</div>` : ""}${
          g.shared && g.shared.length
            ? html`<div class="dim">These files also hold other runs' changes, and a file is committed whole:</div>
                <pre class="files">${g.shared.join("\n")}</pre>`
            : ""
        }<textarea id="gmsg" aria-label="Commit message" placeholder="feat(area): what changed">${u.msg}</textarea>
        <div class="dim" id="glong" hidden>The first line is over 72 characters; logs will cut it short.</div>
      </div>`
    : "";
  // The inline confirm or form the last click opened, in place of the split button.
  const ask =
    u.ask === "pr" || u.ask === "draft"
      ? html`<div class="gsec gform">
          <div class="ghd">${u.ask === "draft" ? "Draft pull request" : "Pull request"} into ${b.base}</div>
          <input
            id="gtitle"
            aria-label="Title"
            value="${u.title ?? (commitMsg(store.runDoc.impl) || c.title || "").split("\n")[0]}"
          /><textarea id="gbody" aria-label="Description">${u.body ?? `Run ${c.id}.`}</textarea>
          <div class="row">
            <button class="btn ghost" data-a="cancel">Cancel</button
            ><button class="btn pri" data-a="go-${u.ask}">
              ${b.upstream && g.ahead === 0 ? "" : "Push & "}${u.ask === "draft" ? "create draft PR" : "create PR"}
            </button>
          </div>
        </div>`
      : u.ask === "merge"
        ? html`<div class="gsec gform">
            <div class="ghd">Merge #${pr.number} into ${b.base} by rebase?</div>
            <div class="dim">The worktree stays until you remove it.</div>
            <div class="row">
              <button class="btn ghost" data-a="cancel">Cancel</button
              ><button class="btn pri" data-a="go-merge">Merge PR</button>
            </div>
          </div>`
        : u.ask === "remove"
          ? html`<div class="gsec gform">
              <div class="ghd">Remove the worktree and delete ${b.branch}?</div>
              <div class="dim">Its work is on ${b.base}. The branch is deleted here and on GitHub.</div>
              <div class="row">
                <button class="btn ghost" data-a="cancel">Cancel</button
                ><button class="btn danger" data-a="go-remove">Remove workspace</button>
              </div>
            </div>`
          : "";
  const menu = all
    .map(
      (x) =>
        html`<button data-a="${x.a}" ${x.why ? " disabled" : ""}>
          <span>${x.label}</span>${x.why ? html`<small>${x.why}</small>` : ""}
        </button>`,
    )
    .concat(
      pr
        ? [
            html`<hr />
              <a href="${pr.url}" target="_blank" rel="noopener">Open PR on GitHub</a>`,
          ]
        : [],
    );
  const split = ask
    ? ""
    : html`<div class="split gsplit">
        <button class="btn ${next ? "pri" : ""}" data-a="${next ? next.a : ""}" ${next ? "" : " disabled"}>
          ${next ? next.label : "Up to date"}</button
        ><button class="btn ${next ? "pri" : ""} gmore" aria-label="More git actions" aria-haspopup="menu">
          <svg><use href="#i-chev" /></svg>
        </button>
        <div class="menu-pop" role="menu" hidden>${raw(menu.join(""))}</div>
      </div>`;
  body.innerHTML = html`<div class="gitp">
    <div class="ghead">
      ${chip}
      <div class="gbr" title="${g.branch}">${b ? b.branch : g.branch || "HEAD"}</div>
      <div class="gto">→ ${target}</div>
    </div>
    ${changes}${empty}${ask}${split}
  </div>`;
  wire(c, body.querySelector(".gitp"));
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
  commit: "Pushing…",
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
  if (a === "commit" && !(u.msg || "").trim()) return toast("A commit message is required");
  b.disabled = true;
  b.dataset.busy = 1;
  b.textContent = BUSY[a] || "Working…";
  const base = { dir: c.state, id: c.id };
  const r =
    a === "commit" || a === "push"
      ? await post("/commit", { ...base, message: a === "commit" ? u.msg : "", files: store.runDoc.git.files })
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
      a === "commit" || a === "push"
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
