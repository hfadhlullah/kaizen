import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { host, toast, cn } from "../lib/core/index.ts";
import {
  call,
  childPath,
  closeAdd,
  CURRENT,
  folderName,
  useAddProject,
  workspaceBranch,
  type Start,
  branchSlug,
} from "../lib/project/index.ts";
import { Button } from "../ui/button.tsx";
import { Checkbox } from "../ui/checkbox.tsx";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog.tsx";
import { Input } from "../ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";
import { Field } from "./field.tsx";

type View = Start | "menu";
const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";
const input = { autoComplete: "off", spellCheck: false } as const;

// One step's frame: title, hint, its fields, the server's complaint, and Back, Cancel and the main button.
function Step({
  title,
  hint,
  err,
  go,
  busy,
  back,
  onSubmit,
  keys,
  children,
}: {
  title: string;
  hint?: string;
  err: string;
  go: string;
  busy?: string;
  back?: () => void;
  onSubmit: () => void;
  keys?: boolean;
  children: ReactNode;
}) {
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e: FormEvent) => (e.preventDefault(), onSubmit())}
      onKeyDown={(e) => {
        if (keys && e.key === "Enter" && (e.ctrlKey || e.metaKey))
          (e.preventDefault(), e.currentTarget.requestSubmit());
      }}
    >
      <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {children}
      {err && (
        <p
          role="alert"
          className="rounded-xs border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-sm text-danger"
        >
          {err}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {keys && (
          <kbd aria-hidden className="mr-auto font-mono text-xs text-muted-foreground">
            {MOD} ↵
          </kbd>
        )}
        {back && (
          <Button variant="ghost" onClick={back}>
            Back to add options
          </Button>
        )}
        <Button variant="ghost" onClick={closeAdd}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={!!busy}>
          {busy || go}
        </Button>
      </div>
    </form>
  );
}

// A project was added: the sheet closes, a toast says so, and the board switches to it in place.
const landed = (stateDir: string, msg: string) => {
  closeAdd();
  toast(msg);
  void host.pickProject(stateDir);
};
// The folder dialog; with `name`, the picked folder is a parent and the project's name is appended.
async function pick(set: (v: string) => void, name?: () => string) {
  const p = await call("/pick-folder", {});
  if (p.d.path) set(name ? childPath(p.d.path, name()) : p.d.path);
}
const PickRow = ({ children, onPick }: { children: ReactNode; onPick: () => void }) => (
  <div className="flex items-center gap-1.5">
    {children}
    <Button variant="ghost" onClick={onPick}>
      Pick…
    </Button>
  </div>
);

function Option({ title, sub, to, go }: { title: string; sub: string; to: Start; go: (v: Start) => void }) {
  return (
    <Button
      className="h-auto flex-col items-start gap-0.5 whitespace-normal px-3 py-2 text-left"
      onClick={() => go(to)}
    >
      <b className="font-semibold">{title}</b>
      <small className="text-sm font-normal text-muted-foreground">{sub}</small>
    </Button>
  );
}

function FolderStep({ back }: { back?: () => void }) {
  const [path, setPath] = useState(""),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Step
      title="Existing folder"
      hint="Pick a folder, or type its path. A .kaizen folder is added to it."
      err={err}
      go="Add project"
      busy={busy ? "Adding..." : ""}
      back={back}
      onSubmit={async () => {
        if (!path.trim()) return;
        setBusy(true);
        const r = await call("/add-project", { path: path.trim() });
        setBusy(false);
        r.ok ? landed(r.d.dir, r.d.already ? "Project already added" : "Project added") : setErr(r.d.error);
      }}
    >
      <PickRow onPick={() => void pick(setPath)}>
        <Input
          {...input}
          autoFocus
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/path/to/folder"
          aria-label="Folder"
          required
        />
      </PickRow>
    </Step>
  );
}

function CloneStep({ back }: { back?: () => void }) {
  const [url, setUrl] = useState(""),
    [to, setTo] = useState(""),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    // The folder this form filled in; one the user typed is left alone.
    auto = useRef(""),
    name = useRef(""),
    asked = useRef("");
  const check = async (u = url, cur = to) => {
    if (!u.trim()) return false;
    asked.current = u;
    const r = await call("/clone", { url: u.trim(), check: true });
    if (!r.ok) return (setErr(r.d.error), false);
    setErr("");
    name.current = r.d.name;
    if (!cur.trim() || cur === auto.current) {
      auto.current = r.d.to;
      setTo(r.d.to);
    }
    return true;
  };
  return (
    <Step
      title="Clone from URL"
      hint="Enter the Git URL (https or ssh) and choose where to clone it."
      err={err}
      go="Clone"
      busy={busy ? "Cloning..." : ""}
      back={back}
      onSubmit={async () => {
        if (!(await check())) return;
        setBusy(true);
        const r = await call("/clone", { url: url.trim(), to: to.trim() || undefined });
        setBusy(false);
        r.ok ? landed(r.d.dir, "Cloned") : setErr(r.d.error);
      }}
    >
      <Input
        {...input}
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => url !== asked.current && void check()}
        placeholder="https://github.com/user/repo.git"
        aria-label="Git URL"
        required
      />
      <PickRow onPick={async () => ((await check()) ? pick(setTo, () => name.current) : void 0)}>
        <Input
          {...input}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Folder to clone into"
          aria-label="Clone into"
        />
      </PickRow>
    </Step>
  );
}

function CreateStep({ back }: { back?: () => void }) {
  const [name, setName] = useState(""),
    [to, setTo] = useState(""),
    [git, setGit] = useState(true),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    auto = useRef(""),
    latest = useRef(""),
    box = useRef<HTMLInputElement>(null);
  // The folder follows the name until the person types one of their own.
  const typed = async (n: string) => {
    setName(n);
    latest.current = n.trim();
    const t = latest.current;
    if (!folderName(t) || (to.trim() && to !== auto.current)) return;
    const r = await call("/new-project", { name: t, check: true });
    if (r.ok && latest.current === t) {
      auto.current = r.d.to;
      setTo(r.d.to);
    }
  };
  return (
    <Step
      title="Create a new project"
      hint="Name it and kaizen will create the folder with a .kaizen inside."
      err={err}
      go="Create project"
      busy={busy ? "Creating..." : ""}
      back={back}
      onSubmit={async () => {
        if (!name.trim()) return box.current?.focus();
        setBusy(true);
        const r = await call("/new-project", { name: name.trim(), to: to.trim() || undefined, git });
        setBusy(false);
        if (!r.ok) return setErr(r.d.error);
        landed(r.d.dir, r.d.git === false ? "Project created, but git init failed" : "Project created");
      }}
    >
      <Input
        {...input}
        ref={box}
        autoFocus
        value={name}
        onChange={(e) => void typed(e.target.value)}
        placeholder="my-project"
        aria-label="Name"
        required
      />
      <PickRow onPick={() => void pick(setTo, () => name.trim())}>
        <Input
          {...input}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Folder to create"
          aria-label="Create in"
        />
      </PickRow>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={git} onCheckedChange={(v) => setGit(v === true)} /> Git repository
      </label>
    </Step>
  );
}

// New workspace, after Orca's composer: one name box, the start branch on its label row, Advanced for an exact branch.
function WorkspaceStep({ dir, back }: { dir?: string | null; back?: () => void }) {
  const projects = host.gitProjects();
  const [project, setProject] = useState(projects.some((p) => p.dir === dir) ? dir! : (projects[0]?.dir ?? "")),
    [bases, setBases] = useState<{ def: string; list: string[] }>({ def: "", list: [] }),
    [base, setBase] = useState(CURRENT),
    [name, setName] = useState(""),
    [branch, setBranch] = useState(""),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void call("/branches?dir=" + encodeURIComponent(project)).then((r) => {
      if (!live) return;
      const { def = "", branches = [] } = r.ok ? r.d : {};
      setBases({ def, list: branches });
      setBase(branches.length ? def || branches[0] : CURRENT);
    });
    return () => {
      live = false;
    };
  }, [project]);
  return (
    <Step
      title="New workspace"
      err={err}
      go="Create workspace"
      busy={busy ? "Creating..." : ""}
      back={back}
      keys
      onSubmit={async () => {
        if (busy) return;
        setErr("");
        setBusy(true);
        const r = await call("/worktree", {
          dir: project,
          branch: workspaceBranch(branch, name),
          base: base === CURRENT ? undefined : base,
        });
        setBusy(false);
        if (!r.ok) return setErr(r.d.error);
        closeAdd();
        location.href = host.wsHref(project, r.d.path);
      }}
    >
      <Field label="Project">
        {(p) => (
          <Select value={project} onValueChange={setProject}>
            <SelectTrigger {...p} aria-label="Project" className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projects.map((x) => (
                <SelectItem key={x.dir} value={x.dir}>
                  {x.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <div className="flex items-center justify-between gap-2">
        <span id="wsfl" className="text-sm text-muted-foreground">
          Create from <i className="opacity-70 not-italic">[Optional]</i>
        </span>
        <label className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
          from
          <Select value={base} onValueChange={setBase}>
            <SelectTrigger size="sm" aria-label="Start from branch" className="max-w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {bases.list.length ? (
                bases.list.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value={CURRENT}>current branch</SelectItem>
              )}
            </SelectContent>
          </Select>
        </label>
      </div>
      <Input
        {...input}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="What is this workspace for?"
        aria-labelledby="wsfl"
      />
      <details className="group">
        <summary className="cursor-pointer py-0.5 text-sm text-muted-foreground group-open:mb-2">Advanced</summary>
        <Field label="Branch name">
          {(p) => (
            <Input
              {...p}
              {...input}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder={branchSlug(name) || "feature/my-branch"}
            />
          )}
        </Field>
      </details>
    </Step>
  );
}

function Menu({ go }: { go: (v: Start) => void }) {
  const ws = host.gitProjects().length > 0;
  return (
    <div className="flex flex-col gap-2.5">
      <DialogTitle className="text-base font-semibold">Add a project</DialogTitle>
      <p className="text-sm text-muted-foreground">Add a project to get started with kaizen.</p>
      <Option title="Existing folder" sub="A project, a Git repo, or any folder" to="folder" go={go} />
      <p className="text-sm text-muted-foreground">Other ways to add</p>
      <Option title="Clone from URL" sub="Clone a remote Git repository" to="clone" go={go} />
      <Option title="Create new project" sub="Start from an empty folder" to="create" go={go} />
      {ws && <Option title="New workspace" sub="A branch in its own folder, in a project you have" to="ws" go={go} />}
      <div className="flex justify-end">
        <Button variant="ghost" onClick={closeAdd}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Sheet({ dir, start }: { dir?: string | null; start?: Start }) {
  const [view, setView] = useState<View>(start ?? "menu");
  // Opened from a project row: there is no chooser to go back to.
  const back = start === "ws" ? undefined : () => setView("menu");
  return (
    <DialogContent
      aria-describedby={undefined}
      aria-label="Add a project"
      className={cn(view === "ws" && "w-[min(576px,calc(100vw-32px))] max-h-[85dvh] overflow-y-auto")}
    >
      {view === "menu" && <Menu go={setView} />}
      {view === "folder" && <FolderStep back={back} />}
      {view === "clone" && <CloneStep back={back} />}
      {view === "create" && <CreateStep back={back} />}
      {view === "ws" && <WorkspaceStep dir={dir} back={back} />}
    </DialogContent>
  );
}

// The Add a project sheet, open while lib/project/add-project.ts says so. A new open is a new sheet (its `n` is its key).
export function AddProjectDialog() {
  const open = useAddProject((s) => s.open);
  return (
    <Dialog open={!!open} onOpenChange={(o) => !o && closeAdd()}>
      {open && <Sheet key={open.n} dir={open.dir} start={open.start} />}
    </Dialog>
  );
}
