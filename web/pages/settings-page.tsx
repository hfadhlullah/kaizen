import { useEffect, useMemo, useRef, useState } from "react";
import {
  SettingsLoading,
  SettingsNav,
  Tile,
  UpdateBar,
  SettingsSection,
} from "../components/settings/index.ts";
import { useNarrow } from "../lib/shared/index.ts";
import {
  pickPage,
  useSettings,
  filterSections,
  genericSections,
  notifyHelp,
  PAGES,
  pageHasMatch,
  pageSections,
  shownPage,
  visibleRows,
} from "../lib/settings/index.ts";
import { Icon } from "@web/ui";

// Settings: a sidebar of pages and the page chosen. One page shows at a time (the first with a match while searching,
// the list of pages on a phone). What each page holds and which control draws it is decided in lib/settings/settings.ts.
export function SettingsPage() {
  const data = useSettings((s) => s.data),
    q = useSettings((s) => s.q),
    page = useSettings((s) => s.page),
    notifyOn = useSettings((s) => s.prefs.notify),
    narrow = useNarrow(),
    [typing, setTyping] = useState(false),
    main = useRef<HTMLDivElement>(null);
  const { pages, hits, current } = useMemo(() => {
    if (!data) return { pages: new Map(), hits: [] as string[], current: null };
    const permission = typeof Notification === "undefined" ? null : Notification.permission;
    const env = {
      notifyHelp: notifyHelp(permission, notifyOn),
      notifyOn,
      scoped: !!data.cfg && data.cfg.scope !== "all",
      agentCount: data.agents?.agents.filter((a) => a.installed).length ?? 0,
    };
    const generic = genericSections(data, env);
    const pages = new Map(PAGES.map((p) => [p.id, filterSections(pageSections(p.id, data, env, generic), q)]));
    const hits = PAGES.filter((p) => pageHasMatch(pages.get(p.id)!)).map((p) => p.id);
    return { pages, hits, current: shownPage({ picked: page, hits, query: q, narrow, typing: typing && narrow }) };
  }, [data, q, page, narrow, typing, notifyOn]);
  // A new page starts at the top.
  useEffect(() => {
    if (main.current) main.current.scrollTop = 0;
    const body = document.getElementById("pbody");
    if (body) body.scrollTop = 0;
  }, [current]);
  if (!data) return <SettingsLoading />;
  const p = PAGES.find((x) => x.id === current),
    scopeName =
      data.cfg && data.cfg.scope !== "all"
        ? (data.cfg.projects.find((x) => x.dir === data.cfg!.scope)?.label ?? "")
        : "";
  return (
    <div
      id="sset"
      className="grid h-full grid-cols-[clamp(220px,24vw,272px)_minmax(0,1fr)] max-[640px]:block max-[640px]:h-auto"
    >
      <SettingsNav hits={hits} current={current} onSearchFocus={setTyping} />
      <div
        id="smain"
        ref={main}
        className={`m-2 mb-0 ml-0 min-w-0 overflow-y-auto rounded-lg border border-border bg-background px-[clamp(16px,5vw,56px)] pb-16 pt-9 max-[640px]:m-0 max-[640px]:overflow-visible max-[640px]:rounded-none max-[640px]:border-0 max-[640px]:bg-transparent max-[640px]:p-0 max-[640px]:pb-6 ${current === null ? "max-[640px]:hidden" : ""}`}
      >
        {p && (
          <div data-page={p.id} className="mx-auto max-w-[720px]">
            <button
              type="button"
              className="mb-3 hidden items-center gap-1.5 text-base text-muted-foreground hover:text-foreground max-[640px]:flex"
              onClick={() => pickPage("")}
            >
              <Icon name="chev" className="size-(--ico) rotate-90" />
              Settings
            </button>
            <header className="mb-6 flex items-center gap-3.5 max-[640px]:mb-5 max-[640px]:gap-3">
              <Tile
                name={p.ico}
                className="size-[52px] rounded-lg border border-border bg-background text-foreground max-[640px]:size-10 [&_svg]:size-[26px] max-[640px]:[&_svg]:size-5"
              />
              <div>
                <h2 className="mb-1.5 text-[22px] font-semibold leading-tight text-strong">{p.title}</h2>
                <p className="text-sm leading-normal text-muted-foreground">
                  {p.desc}
                  {scopeName ? ` Editing ${scopeName}.` : ""}
                </p>
              </div>
            </header>
            {p.id === "general" && <UpdateBar />}
            {pages.get(p.id)!.map((s: any) => (
              <SettingsSection key={s.title} section={s} />
            ))}
          </div>
        )}
        {!data.cfg && (
          <p className="mt-5 text-muted-foreground">
            Settings could not be read. Run <code>kaizen settings</code>.
          </p>
        )}
        {!hits.length && (
          <p id="snone" className="mt-5 text-muted-foreground">
            No setting matches “{q.trim()}”.
          </p>
        )}
      </div>
    </div>
  );
}
