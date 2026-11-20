import { useState } from "react";
import { cn } from "@lib/core";
import { installStorePlugin, installStoreSkill, searchSkills, useSettings, type PluginHit, type StoreHit } from "@lib/settings";
import { Segmented } from "@components/shared";
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from "@web/ui";

// One audit's answer as a chip: safe and low read as a pass, medium as a warning, high and critical as a fail, and no
// answer as unknown.
const TONE: Record<string, string> = {
  safe: "text-success border-success/50",
  low: "text-success border-success/50",
  medium: "text-warning border-warning/55",
  high: "text-danger border-danger/50",
  critical: "text-danger border-danger/50",
};
function Chip({ who, risk, score }: { who: string; risk: string; score?: number }) {
  return (
    <span
      className={cn("rounded-full border px-2 text-[11px]", TONE[risk] ?? "border-border text-muted-foreground")}
      title={`${who}: ${risk === "unknown" ? "no audit yet" : risk}`}
    >
      {who}: {risk === "unknown" ? "no audit" : risk}
      {score != null ? ` · ${score}` : ""}
    </span>
  );
}
const count = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));

// The Install button's word: looking first, then installing.
function useStep(name: string) {
  return useSettings((s) => (s.busy === "look-" + name ? "Checking…" : s.busy === "store-" + name ? "Installing…" : ""));
}
const letter = (name: string) => (/[a-z0-9]/i.exec(name)?.[0] ?? "?").toUpperCase();
const mark =
  "grid size-6 shrink-0 place-items-center rounded-sm border border-border text-xs font-semibold text-muted-foreground";

// The skill's mark: its GitHub owner's picture, as skills.sh shows it, or the first letter when that does not load.
export function OwnerMark({ source, name }: { source: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const owner = source.split("/")[0]!;
  if (failed)
    return (
      <span aria-hidden="true" className={mark}>
        {letter(name)}
      </span>
    );
  return (
    <img
      src={`https://github.com/${encodeURIComponent(owner)}.png?size=48`}
      alt=""
      width={24}
      height={24}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-6 shrink-0 rounded-sm border border-border"
    />
  );
}

function Hit({ h, onInstalled }: { h: StoreHit; onInstalled: () => void }) {
  const step = useStep(h.name);
  return (
    <div className="px-3.5 py-2.5" data-hit={`${h.source}/${h.name}`}>
      <div className="flex flex-wrap items-center gap-2.5">
        <OwnerMark source={h.source} name={h.name} />
        <span className="min-w-0 flex-[1_1_200px]">
          <b className="block font-medium">
            {h.name}
            <a
              className="ml-1.5 rounded-xs border border-border px-1.5 text-[10.5px] font-normal text-muted-foreground hover:text-foreground"
              href={`https://skills.sh/${h.source}/${h.name}`}
              target="_blank"
              rel="noreferrer"
            >
              {h.source}
            </a>
          </b>
          <span className="text-xs text-muted-foreground">{count(h.installs)} installs</span>
        </span>
        {h.installed ? (
          <span className="text-xs text-muted-foreground">Installed</span>
        ) : (
          <Button
            data-install={h.name}
            disabled={!!step}
            onClick={() => void installStoreSkill(h).then((ok) => ok && onInstalled())}
          >
            {step || (h.clean ? "Install" : "Install…")}
          </Button>
        )}
      </div>
      <div className="ml-[34px] mt-1.5 flex flex-wrap items-center gap-1.5 @max-[520px]:ml-0">
        <Chip who="Gen" risk={h.audit.gen} />
        <Chip who="Socket" risk={h.audit.socket} score={h.audit.socketScore} />
        <Chip who="Snyk" risk={h.audit.snyk} />
      </div>
    </div>
  );
}

// A plugin from Anthropic's official marketplace: who made it and what kind it is. Plugins have no audit.
function PluginRow({ p, onInstalled }: { p: PluginHit; onInstalled: () => void }) {
  const step = useStep(p.name);
  return (
    <div className="px-3.5 py-2.5" data-plugin-hit={p.name}>
      <div className="flex flex-wrap items-center gap-2.5">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-6 shrink-0 fill-none stroke-current stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round]"
        >
          <path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3" />
        </svg>
        <span className="min-w-0 flex-[1_1_200px]">
          <b className="block font-medium">
            {p.name}
            {p.category && (
              <em className="ml-1.5 rounded-xs border border-border px-1.5 text-[10.5px] font-normal not-italic text-muted-foreground">
                {p.category}
              </em>
            )}
          </b>
          <span className="block text-xs text-muted-foreground">{p.description}</span>
        </span>
        {p.installed ? (
          <span className="text-xs text-muted-foreground">Installed</span>
        ) : (
          <Button data-install-plugin={p.name} disabled={!!step} onClick={() => void installStorePlugin(p).then((ok) => ok && onInstalled())}>
            {step || "Install…"}
          </Button>
        )}
      </div>
      <div className="ml-[34px] mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground @max-[520px]:ml-0">
        <span>By {p.author || "an unnamed author"}</span>
        <span className="rounded-full border border-border px-2 text-[11px]">Anthropic marketplace, no audit</span>
        {p.homepage && (
          <a className="hover:text-foreground" href={p.homepage} target="_blank" rel="noreferrer">
            Homepage
          </a>
        )}
      </div>
    </div>
  );
}

// Find skills: search skills.sh through kaizen, see who made each one, how many installed it and its three audits.
export function SkillStore() {
  const [q, setQ] = useState(""),
    [source, setSource] = useState<"skills" | "plugins">("skills"),
    [hits, setHits] = useState<any[] | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const go = async (text = q, from = source) => {
    // The plugin list can be browsed with no words; skills.sh needs some.
    if (!text.trim() && from === "skills") return;
    setLoading(true);
    const r = await searchSkills(text.trim(), from);
    setLoading(false);
    setHits(r.hits);
    setError(r.error ?? "");
  };
  return (
    <div className="flex flex-col gap-2 px-3.5 py-3">
      <Segmented
        label="Where to search"
        idPrefix="sk-src"
        className="self-start"
        options={[
          { id: "skills", label: "skills.sh" },
          { id: "plugins", label: "Claude plugins" },
        ]}
        value={source}
        onChange={(v) => {
          setSource(v);
          setHits(null);
          setError("");
          if (v === "plugins") void go(q, v);
        }}
      />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <Input
          aria-label="Search skills"
          placeholder={source === "skills" ? "Search skills.sh, for example pdf, design or testing" : "Filter Anthropic's official plugins"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={100}
        />
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>
      {/* How each source is checked, in a popup by the field (a tap opens it, so it works on a phone too). */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {source === "skills" ? "Audited by Gen, Socket and Snyk, and scanned before install." : "Anthropic's official plugins. No audit, so every install asks twice."}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="How it's checked"
              title="How it's checked"
              className="grid size-4 place-items-center rounded-full border border-current text-[10px] font-semibold leading-none hover:text-foreground"
            >
              i
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-w-[min(340px,calc(100vw-24px))] p-3 text-xs leading-relaxed">
            {source === "skills"
              ? "Before it installs, kaizen downloads a copy and scans it with Cisco's skill-scanner (when uv is on this computer). A pass lowers the risk; it does not prove a skill is safe. Anything short of a clean audit and scan asks twice."
              : "Plugins can run hooks and MCP servers, so kaizen downloads a copy first, lists what it brings and scans its skills."}
          </PopoverContent>
        </Popover>
      </p>
      {error && <p className="text-sm text-warning">{error}</p>}
      {hits && !hits.length && !error && <p className="text-sm text-muted-foreground">No skills found.</p>}
      {hits && hits.length > 0 && (
        <div className="-mx-3.5 divide-y divide-border border-t border-border">
          {hits.map((h) => {
            const done = () => setHits((hs) => hs?.map((x) => (x === h ? { ...x, installed: true } : x)) ?? null);
            return source === "plugins" ? (
              <PluginRow key={h.name} p={h} onInstalled={done} />
            ) : (
              <Hit key={`${h.source}/${h.name}`} h={h} onInstalled={done} />
            );
          })}
        </div>
      )}
    </div>
  );
}
