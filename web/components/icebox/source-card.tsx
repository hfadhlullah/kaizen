import { useEffect, useState } from "react";
import {
  ago,
  hostOf,
  platOf,
  PLAT,
  srcType,
  webUrl,
  type Source,
  checkNow,
  gatherSocial,
  moveSource,
  removeSource,
  saveCategory,
  setAutoGather,
  setWriteBack,
} from "../../lib/icebox/index.ts";
import { host, cn } from "../../lib/core/index.ts";
import { Button } from "../../ui/button.tsx";
import { Icon } from "../../ui/icon.tsx";
import { Input } from "../../ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select.tsx";
import { Switch } from "../../ui/switch.tsx";
import { Favicon } from "./favicon.tsx";
import { Field, IconButton, ProjectMark } from "../shared/index.ts";

const badge = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3";
// One source: where it is, how its last gather went, its category and project, and its two switches.
export function SourceCard({ s, chatOn, googleConnected }: { s: Source; chatOn: boolean; googleConnected: boolean }) {
  const [cat, setCat] = useState(s.category || "");
  // The category changed elsewhere (another tab, the server's own write): show it, so Save is never offered for it.
  useEffect(() => setCat(s.category || ""), [s.category]);
  const [to, setTo] = useState(s.dir),
    [busy, setBusy] = useState(""),
    title = s.label || hostOf(s.url),
    type = srcType(s),
    projects = host.projects(),
    run = async (what: string, f: () => Promise<unknown>) => {
      setBusy(what);
      try {
        await f();
      } finally {
        setBusy("");
      }
    },
    status =
      s.social && (!s.last || (!s.last.ok && /gathered by your agent/i.test(s.last.note))) ? (
        <span className={cn(badge, "bg-[color-mix(in_srgb,var(--dim)_14%,transparent)] text-muted-foreground")}>
          <Icon name="at" />
          {chatOn ? "Gathered with ChatGPT" : "Gathered by your agent"}
        </span>
      ) : !s.last ? (
        <span className={cn(badge, "bg-[color-mix(in_srgb,var(--dim)_14%,transparent)] text-muted-foreground")}>
          Not gathered yet
        </span>
      ) : (
        <>
          <span
            className={cn(
              badge,
              s.last.ok
                ? "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-success"
                : "bg-[color-mix(in_srgb,var(--warn)_20%,transparent)] text-foreground",
            )}
          >
            {s.last.ok ? (
              <Icon name="check" />
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true" className="text-warning">
                <circle cx="8" cy="8" r="6" stroke="currentColor" fill="none" strokeWidth="1.8" />
                <path d="M8 5v3.5M8 11v.1" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            {s.last.ok ? s.last.note : `Failed: ${s.last.note}`}
          </span>
          <span>{ago(s.last.at)}</span>
        </>
      );
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 pb-2.5 pt-3 transition-colors hover:border-[color-mix(in_srgb,var(--line)_70%,var(--ink))]">
      <div className="flex items-center gap-2.5">
        <span
          className="inline-grid size-7 shrink-0 place-items-center rounded-sm bg-muted"
          title={type === "social" ? PLAT[s.social!] || "social" : type}
        >
          <Favicon
            url={s.url}
            social={s.social}
            fallback={type === "sheet" ? "sheet" : type === "doc" ? "doc" : type === "social" ? "at" : "link"}
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-base font-semibold text-foreground" title={title}>
            {title}
          </span>
          <a
            href={webUrl(s.url)}
            target="_blank"
            rel="noopener noreferrer"
            title={s.url}
            className="group/u inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="truncate">{s.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
            <Icon name="ext" className="size-[11px] shrink-0 opacity-0 transition-opacity group-hover/u:opacity-100" />
          </a>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {s.social ? (
            <IconButton
              icon="refresh"
              label={chatOn ? "Gather with your ChatGPT plan" : "Gather: opens your agent on /kaizen gather"}
              aria-label={`Gather ${title} with your agent`}
              disabled={!!busy}
              className="size-7"
              onClick={() => void run("gather", () => gatherSocial(s))}
            />
          ) : (
            <IconButton
              icon="refresh"
              label="Check now"
              aria-label={`Check ${title} now`}
              disabled={!!busy}
              className="size-7"
              onClick={() => void run("gather", () => checkNow(s))}
            />
          )}
          <IconButton
            icon="trash"
            label="Remove source"
            aria-label={`Remove ${title}`}
            className="size-7 hover:text-danger"
            onClick={() => void removeSource(s)}
          />
        </div>
      </div>
      {busy === "gather" && (
        <span className="text-xs text-muted-foreground" role="status">
          {s.social ? (chatOn ? "Gathering…" : "") : "Checking…"}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{status}</div>
      <div className="grid grid-cols-2 gap-1.5 border-t border-border pt-2 max-sm:grid-cols-1">
        <Field label="Category" inline>
          {(p) => (
            <>
              <Input
                {...p}
                value={cat}
                maxLength={40}
                placeholder={platOf(s)}
                aria-label={`Category of ${title}`}
                className="h-7 min-w-0 flex-1 text-sm"
                onChange={(e) => setCat(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && cat.trim() !== (s.category || "") && void saveCategory(s, cat.trim())
                }
              />
              {cat.trim() !== (s.category || "") && (
                <Button
                  variant="primary"
                  size="sm"
                  aria-label={`Save the category of ${title}`}
                  onClick={() => void saveCategory(s, cat.trim())}
                >
                  Save
                </Button>
              )}
            </>
          )}
        </Field>
        <Field label="Project" inline>
          {(p) => (
            <>
              <ProjectMark dir={s.dir} label={s.project || ""} />
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger id={p.id} aria-label={`Project of ${title}`} size="sm" className="min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!projects.some((x) => x.dir === s.dir) && (
                    <SelectItem value={s.dir}>{s.project || s.dir}</SelectItem>
                  )}
                  {projects.map((x) => (
                    <SelectItem key={x.dir} value={x.dir} title={x.label}>
                      {x.label.split(/[\\/]/).pop()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {to !== s.dir && (
                <Button
                  variant="primary"
                  size="sm"
                  aria-label={`Move ${title} to the chosen project`}
                  onClick={() => void moveSource(s, to)}
                >
                  Move
                </Button>
              )}
            </>
          )}
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {(type === "sheet" || /github\.com/.test(s.url)) && (
          <label className="inline-flex items-center gap-2">
            Write back
            <Switch
              checked={!!s.writeback}
              aria-label={`Write back to ${title}`}
              onCheckedChange={(on) => void setWriteBack(s, on, googleConnected)}
            />
          </label>
        )}
        <label
          className="inline-flex items-center gap-2"
          title="Off: the scheduled gather skips this source; Check now still reads it"
        >
          Auto gather
          <Switch
            checked={!s.paused}
            aria-label={`Auto gather ${title}`}
            onCheckedChange={(on) => void setAutoGather(s, on)}
          />
        </label>
      </div>
    </div>
  );
}
