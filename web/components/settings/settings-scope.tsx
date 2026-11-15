import { pickScope, useSettings } from "@lib/settings";
import { Icon, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@web/ui";

const last = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const tile = (name: string, big?: boolean) => (
  <span
    className={`grid shrink-0 place-items-center rounded-md border border-border bg-background text-foreground ${big ? "size-[34px]" : "size-[22px]"}`}
  >
    <Icon name={name} className={big ? "size-[18px]" : "size-3.5"} />
  </span>
);

// "Settings for": the project being edited, where macOS shows your account. All projects edits ~/.kaizen/config.yml, a
// project edits its own .kaizen/config.yml. Always opens on All projects.
export function SettingsScope() {
  const cfg = useSettings((s) => s.data?.cfg);
  if (!cfg) return null;
  const scoped = cfg.scope !== "all",
    name = scoped ? last(cfg.projects.find((p) => p.dir === cfg.scope)?.label ?? cfg.scope) : "All projects";
  return (
    <div className="mb-2.5 max-[640px]:mb-4">
      <Select value={cfg.scope} onValueChange={pickScope}>
        <SelectTrigger
          id="s-scope"
          aria-label="Settings for"
          title={
            scoped
              ? "This project's own .kaizen/config.yml; anything it does not set comes from All projects."
              : "~/.kaizen/config.yml; a project's own config wins where it sets a value."
          }
          className="h-auto w-full gap-2.5 rounded-lg px-3 py-2.5 text-left"
        >
          <SelectValue>
            <span className="flex items-center gap-2.5">
              {tile(scoped ? "board" : "home", true)}
              <span className="grid min-w-0 flex-1 leading-snug">
                <small className="text-xs text-muted-foreground">Settings for</small>
                <b className="truncate text-lg font-semibold text-strong">{name}</b>
                <small className="text-xs text-muted-foreground">
                  {scoped ? "Overrides All projects" : "Every project"}
                </small>
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {[{ dir: "all", label: "All projects" }, ...cfg.projects].map((p) => (
            <SelectItem key={p.dir} value={p.dir} className="min-h-9 gap-2.5">
              <span className="flex items-center gap-2.5">
                {tile(p.dir === "all" ? "home" : "board")}
                <span className="grid min-w-0 leading-snug">
                  <span className="truncate">{p.dir === "all" ? p.label : last(p.label)}</span>
                  {p.dir !== "all" && (
                    <small className="truncate text-xs text-muted-foreground [direction:rtl] text-left">
                      {"‎" + p.label + "‎"}
                    </small>
                  )}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
