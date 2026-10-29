// The Projects "+" sheet, modelled on Orca's "Add a project": a chooser (existing folder,
// clone from URL, create new project, new workspace), then one form with a way back.
// Every call is a JSON POST to the board; the server validates paths, URLs and refs again.
import { html, modal } from "./dom.ts";
import { gitProjects, wsHref } from "./workspace.ts";

type Start = "folder" | "clone" | "create" | "ws";
const SEP = (p: string) => (p.includes("\\") ? "\\" : "/");

async function call(path: string, body?: object): Promise<{ ok: boolean; d: any }> {
  try {
    const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, d: r.ok ? d : { error: d.error || d.why || "that did not work" } };
  } catch {
    return { ok: false, d: { error: "the board is offline" } };
  }
}

// opts.dir: the project the + was opened for (preselected in New workspace); opts.start skips the chooser.
export function openAdd(opts: { dir?: string | null; start?: Start } = {}) {
  const dl = modal("");
  const form = dl.querySelector("form")!;
  dl.setAttribute("aria-label", "Add a project");
  const fixed = opts.start === "ws"; // opened from a project row: no chooser to go back to
  const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
  const busy = (b: HTMLButtonElement, on: boolean, say: string, idle: string) => ((b.disabled = on), (b.textContent = on ? say : idle));
  const back = fixed ? "" : html`<button type="button" class="btn ghost" data-a="back">Back to add options</button>`;
  const foot = (go: string) => html`<small class="att err" role="alert"></small><div class="row">${back}<button type="button" class="btn ghost" data-a="x">Cancel</button><button class="btn pri" data-a="go">${go}</button></div>`;
  const say = (t: string) => ((form.querySelector(".err") as HTMLElement).textContent = t);
  // A project was added: the sheet says so, then the board shows it (the saved project is what the pages read).
  const landed = (stateDir: string, msg: string) => {
    say(msg);
    try {
      localStorage.setItem("kz-proj", stateDir);
    } catch {}
    setTimeout(() => (location.href = "/?view=board"), 900);
  };
  // The folder dialog; with `name`, the picked folder is a parent and the project's name is appended.
  const pick = async (into: HTMLInputElement, name?: () => string) => {
    const p = await call("/pick-folder", {});
    if (p.d.path) into.value = name ? p.d.path.replace(/[\\/]+$/, "") + SEP(p.d.path) + name() : p.d.path;
  };

  const draw = (v: Start | "menu") => {
    const ws = gitProjects();
    if (v === "menu") {
      form.innerHTML = html`<b>Add a project</b><small class="att">Add a project to get started with kaizen.</small><button type="button" class="btn opt" data-go="folder"><b>Existing folder</b><small>A project, a Git repo, or any folder</small></button><small class="att">Other ways to add</small><button type="button" class="btn opt" data-go="clone"><b>Clone from URL</b><small>Clone a remote Git repository</small></button><button type="button" class="btn opt" data-go="create"><b>Create new project</b><small>Start from an empty folder</small></button>${ws.length ? html`<button type="button" class="btn opt" data-go="ws"><b>New workspace</b><small>A branch in its own folder, in a project you have</small></button>` : ""}<div class="row"><button type="button" class="btn ghost" data-a="x">Cancel</button></div>`.toString();
      form.querySelectorAll<HTMLElement>("[data-go]").forEach((b) => (b.onclick = () => draw(b.dataset.go as Start)));
      form.onsubmit = (e) => e.preventDefault();
    } else if (v === "folder") {
      form.innerHTML = html`<b>Existing folder</b><small class="att">Pick a folder, or type its path. A .kaizen folder is added to it.</small><div class="row"><input name="path" placeholder="/path/to/folder" aria-label="Folder" autocomplete="off" spellcheck="false" required><button type="button" class="btn ghost" data-a="pick">Pick…</button></div>${foot("Add project")}`.toString();
      field("path").focus();
      form.onsubmit = async (e) => {
        e.preventDefault();
        const b = form.querySelector<HTMLButtonElement>("[data-a=go]")!;
        busy(b, true, "Adding...", "Add project");
        const r = await call("/add-project", { path: field("path").value.trim() });
        busy(b, false, "", "Add project");
        r.ok ? landed(r.d.dir, r.d.already ? "Project already added" : "Project added") : say(r.d.error);
      };
      form.querySelector<HTMLElement>("[data-a=pick]")!.onclick = () => pick(field("path"));
    } else if (v === "clone") {
      form.innerHTML = html`<b>Clone from URL</b><small class="att">Enter the Git URL (https or ssh) and choose where to clone it.</small><input name="url" placeholder="https://github.com/user/repo.git" aria-label="Git URL" autocomplete="off" spellcheck="false" required><div class="row"><input name="to" placeholder="Folder to clone into" aria-label="Clone into" autocomplete="off" spellcheck="false"><button type="button" class="btn ghost" data-a="pick">Pick…</button></div>${foot("Clone")}`.toString();
      field("url").focus();
      let name = "", auto = ""; // the folder this form filled in; one the user typed is left alone
      const check = async () => {
        const u = field("url").value.trim();
        if (!u) return false;
        const r = await call("/clone", { url: u, check: true });
        if (!r.ok) return say(r.d.error), false;
        say("");
        name = r.d.name;
        if (!field("to").value.trim() || field("to").value === auto) field("to").value = auto = r.d.to;
        return true;
      };
      field("url").onchange = check;
      form.querySelector<HTMLElement>("[data-a=pick]")!.onclick = async () => ((await check()) ? pick(field("to"), () => name) : field("url").focus());
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (!(await check())) return;
        const b = form.querySelector<HTMLButtonElement>("[data-a=go]")!;
        busy(b, true, "Cloning...", "Clone");
        const r = await call("/clone", { url: field("url").value.trim(), to: field("to").value.trim() || undefined });
        busy(b, false, "", "Clone");
        r.ok ? landed(r.d.dir, "Cloned") : say(r.d.error);
      };
    } else if (v === "create") {
      form.innerHTML = html`<b>Create a new project</b><small class="att">Name it and kaizen will create the folder with a .kaizen inside.</small><input name="name" placeholder="my-project" aria-label="Name" autocomplete="off" spellcheck="false" required><div class="row"><input name="to" placeholder="Folder to create" aria-label="Create in" autocomplete="off" spellcheck="false"><button type="button" class="btn ghost" data-a="pick">Pick…</button></div><label class="att"><input type="checkbox" name="git" checked> Git repository</label>${foot("Create project")}`.toString();
      field("name").focus();
      let auto = "";
      field("name").oninput = async () => {
        const n = field("name").value.trim();
        if (!n || /[\\/:*?"<>|]/.test(n) || (field("to").value.trim() && field("to").value !== auto)) return;
        const r = await call("/new-project", { name: n, check: true });
        if (r.ok && field("name").value.trim() === n) field("to").value = auto = r.d.to;
      };
      form.querySelector<HTMLElement>("[data-a=pick]")!.onclick = () => pick(field("to"), () => field("name").value.trim());
      form.onsubmit = async (e) => {
        e.preventDefault();
        const b = form.querySelector<HTMLButtonElement>("[data-a=go]")!;
        busy(b, true, "Creating...", "Create project");
        const r = await call("/new-project", { name: field("name").value.trim(), to: field("to").value.trim() || undefined, git: field("git").checked });
        busy(b, false, "", "Create project");
        if (!r.ok) return say(r.d.error);
        landed(r.d.dir, r.d.git === false ? "Project created, but git init failed" : "Project created");
      };
    } else {
      // New workspace: a project (git ones), a branch name and the branch it starts from.
      const cur = ws.some((p) => p.dir === opts.dir) ? opts.dir : ws[0]?.dir;
      form.innerHTML = html`<b>New workspace</b><small class="att">A new branch in its own folder under .kaizen/wt/.</small><label class="att">Project<select name="project" aria-label="Project">${ws.map((p) => html`<option value="${p.dir}"${p.dir === cur ? " selected" : ""}>${p.name}</option>`)}</select></label><label class="att">Branch name<input name="branch" placeholder="feature/my-branch" aria-label="Branch name" autocomplete="off" spellcheck="false" required></label><label class="att">Base branch<select name="base" aria-label="Base branch"></select></label>${foot("Create workspace")}`.toString();
      field("branch").focus();
      const sel = form.elements.namedItem("base") as HTMLSelectElement;
      const bases = async () => {
        const r = await call("/branches?dir=" + encodeURIComponent(field("project").value));
        const { def = "", branches = [] } = r.ok ? r.d : {};
        sel.innerHTML = (branches as string[]).map((b) => html`<option${b === def ? " selected" : ""}>${b}</option>`.toString()).join("") || `<option value="">current branch</option>`;
      };
      (form.elements.namedItem("project") as HTMLSelectElement).onchange = bases;
      bases();
      form.onsubmit = async (e) => {
        e.preventDefault();
        const dir = field("project").value;
        const b = form.querySelector<HTMLButtonElement>("[data-a=go]")!;
        busy(b, true, "Creating...", "Create workspace");
        const r = await call("/worktree", { dir, branch: field("branch").value.trim(), base: sel.value || undefined });
        busy(b, false, "", "Create workspace");
        r.ok ? (dl.close(), (location.href = wsHref(dir, r.d.path))) : say(r.d.error);
      };
    }
    form.querySelector<HTMLElement>("[data-a=x]")!.onclick = () => dl.close();
    const bk = form.querySelector<HTMLElement>("[data-a=back]");
    if (bk) bk.onclick = () => draw("menu");
  };
  draw(opts.start ?? "menu");
}
