import { store } from "./store.ts";
import { post } from "./api.ts";
import { key } from "./cards.ts";
import { $, html } from "./dom.ts";
import { commitMsg } from "./markdown.ts";
import { openRun } from "./panel.ts";
import { toast } from "./toast.ts";

// Commit and push, for a finished run in a project with a git remote. What the board
// did is recorded per run, so the settled label outlives later changes to the tree.
export function gitBtn(c) {
  const g = store.runDoc.git,
    k = store.runDoc.commit;
  if (c.archived || !g || !g.repo || !(c.status === "done" || c.awaiting === "approvals.review")) return "";
  // A run already pushed keeps saying so; work changed since is offered beside it.
  if (k && k.pushed)
    return (
      html`<button class="btn" disabled title="${k.sha}">Committed &amp; pushed</button>` +
      (g.files.length
        ? `<button class="btn" data-a="commit">Commit new changes</button>`
        : g.ahead > 0
          ? `<button class="btn" data-a="push">Push</button>`
          : "")
    );
  if (g.files.length) return `<button class="btn pri" data-a="commit">Commit &amp; push</button>`;
  if (g.ahead > 0) return `<button class="btn pri" data-a="push">Push</button>`;
  // None of its files changed and level with the remote: it was committed and pushed
  // somewhere else. With no record and no report, nothing says it was ever committed.
  return k || store.runDoc.impl ? `<button class="btn" disabled>Committed &amp; pushed</button>` : "";
}
export function confirmCommit(c, msg) {
  const g = store.runDoc.git,
    foot = $("pfoot");
  foot.innerHTML = html`<div class="inl" style="flex:1"><div class="q">Commit ${g.files.length} changed file${g.files.length === 1 ? "" : "s"} on ${g.branch || "this branch"} and push to ${g.remote}?</div><div class="q dim">Only the files this run's report names.${g.others ? ` ${g.others} other changed file${g.others === 1 ? " is" : "s are"} left alone.` : ""}</div><pre class="files">${g.files.join("\n")}</pre>${g.shared && g.shared.length ? html`<div class="q">These files also hold other runs' changes, and a file is committed whole:</div><pre class="files">${g.shared.join("\n")}</pre>` : ""}<textarea aria-label="Commit message" placeholder="Describe what changed">${msg || commitMsg(store.runDoc.impl) || c.title || c.text}</textarea><div class="q dim" id="clong" hidden>The first line is over 72 characters; logs will cut it short.</div><div class="row"><button class="btn ghost" data-a="c">Cancel</button><button class="btn pri" data-a="s">Commit &amp; push</button></div></div>`;
  const inp = foot.querySelector("textarea"),
    go = foot.querySelector("[data-a=s]");
  inp.focus();
  // Tall enough to show the whole message, up to half the window.
  const fit = () => {
    inp.style.height = "auto";
    inp.style.height = Math.min(inp.scrollHeight + 2, innerHeight / 2) + "px";
    $("clong").hidden = inp.value.split("\n")[0].length <= 72;
  };
  inp.oninput = fit;
  fit();
  foot.querySelector("[data-a=c]").onclick = () => {
    foot.innerHTML = "";
    openRun(c, true);
  };
  go.onclick = () => {
    if (!inp.value.trim()) {
      toast("A commit message is required");
      return;
    }
    commitPush(c, inp.value, go);
  };
  inp.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      go.click();
    }
  };
}
export async function commitPush(c, message, b) {
  b.disabled = true;
  b.dataset.busy = 1;
  b.textContent = "Pushing…";
  const r = await post("/commit", { dir: c.state, id: c.id, message, files: store.runDoc.git.files });
  if (r.ok) toast("Committed & pushed " + r.sha);
  $("pfoot").innerHTML = "";
  if (store.openKey !== key(c)) return;
  await openRun(c, false);
  // A refused message comes back for another try, beside the current file list.
  if (!r.ok && message && store.openKey === key(c) && store.runDoc.git.files && store.runDoc.git.files.length)
    confirmCommit(c, message);
}
