import { useEffect, useReducer } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRoute } from "@lib/router";
import { onState } from "@lib/server";
import {
  BoardChip,
  BulkBar,
  CaptureBox,
  CollectionDialog,
  Favicon,
  RequestCard,
  RequestPhoneRow,
  RequestRow,
  SourceDrawer,
  SwipeDeck,
} from "@components/icebox";
import { ActionMenu, Chip, ConfirmDialog, EmptyState, IconButton, Pager, Picker, Segmented } from "@components/shared";
import {
  useIceData,
  deckOf,
  hiddenCat,
  iceKey,
  isLive,
  isWaiting,
  KIND,
  pName,
  srcGroups,
  srcName,
  srcOf,
  subName,
  deriveIce,
  type RowCtx,
  bulkDo,
  connectChatGPT,
  newCollection,
  skipChatGPT,
  snoozeAll,
  startSwipe,
  patchCap,
  setIce,
  useIce,
  clearFilters,
  iceEls,
  pickBoard,
  INBOX,
  selectPage,
  setView,
  toggleKind,
} from "@lib/icebox";
import { useNarrow, usePager } from "@lib/shared";
import { host } from "@lib/core";
import { showable as showableProjects, useShown } from "@lib/project";
import { stopDictation } from "@lib/dictation";
import { Button, Checkbox, Icon, Input, Popover, PopoverContent, PopoverTrigger, Skeleton } from "@web/ui";

// The Icebox: requests gathered from request sources, read like an inbox, until someone promotes them to tasks or
// dismisses them. A capture box on top, collections and kinds, then the requests as cards or a list, one at a time in
// swipe mode; the sources sit in a drawer. The board's own project pickers (the header's and "Showing") narrow it.
export function IceboxPage() {
  return useRoute((r) => r.page === "icebox") ? <Icebox /> : null;
}
const KIND_TEXT: Record<string, string> = { client: "text-kind-client", finding: "text-kind-finding", people: "text-kind-people" };
function Icebox() {
  useIceData();
  // The board's project pickers change what shows: the "Showing" choice is a store, the board's data redraws it.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const off = onState(bump);
    return () => {
      off();
      stopDictation(true);
    };
  }, []);
  const s = useIce(
    useShallow((s) => ({
      data: s.data,
      loaded: s.loaded,
      view: s.view,
      board: s.board,
      kinds: s.kinds,
      q: s.q,
      cat: s.cat,
      src: s.src,
      sel: s.sel,
      cur: s.cur,
      open: s.open,
      armed: s.armed,
      swipe: s.swipe,
      busy: s.busy,
      ask: s.ask,
      cap: s.cap,
      srcShow: s.srcShow,
      skip: s.swipe?.skip,
    })),
  );
  const narrow = useNarrow(),
    dir = host.scopeDir() || null,
    shown = new Set(useShown((x) => x.shown)),
    showable = showableProjects(),
    data = s.data,
    d = data && !data.error ? deriveIce(data, s, { dir, shown, showable }) : null,
    pg = usePager("icebox", d?.filtered ?? []),
    order = pg.rows,
    cardsOn = s.view === "cards" && !narrow,
    chat = !!data?.gatherer?.connected;
  const deck = d && s.swipe ? deckOf(d.filtered, s.skip ?? new Map()) : [];
  // What j, k, the bulk bar and the swipe keys act on, kept where the keys can read it.
  useEffect(() => void setIce({ order, deck }), [order.map(iceKey).join("|"), deck.map(iceKey).join("|")]);
  // A filter that no longer holds is dropped, a checked request a filter hides is unchecked, and the cursor is
  // always on something that shows (a bulk action only ever acts on what shows).
  useEffect(() => {
    if (!d) return;
    const keys = new Set(d.ice.map(iceKey)),
      vis = new Set(order.map(iceKey));
    setIce((c) => {
      const cur = order[0] ? iceKey(order[0]) : null,
        p = {
          ...(c.board !== d.board ? { board: d.board } : {}),
          ...(c.cat !== d.cat ? { cat: d.cat } : {}),
          ...(c.src !== d.src ? { src: d.src } : {}),
          ...(c.sel.some((k) => !vis.has(k)) ? { sel: c.sel.filter((k) => vis.has(k)) } : {}),
          ...(c.open && !keys.has(c.open) ? { open: null, armed: null } : {}),
          ...((c.cur && vis.has(c.cur)) || c.cur === cur ? {} : { cur }),
        };
      return Object.keys(p).length ? p : c;
    });
  });
  // The capture box saves to this project: the board's one, else the picked, else the one shown, else the first.
  const to =
    dir ||
    (showable.some((p) => p.dir === s.cap.dir)
      ? s.cap.dir
      : (shown.size === 1 ? [...shown][0]! : null) || showable[0]?.dir || null);
  useEffect(() => {
    if (!dir && s.cap.dir !== to) patchCap({ dir: to });
    // A collection picked for another project never goes along when the box's project changes.
    if (s.cap.board && s.cap.boardDir && s.cap.boardDir !== to) patchCap({ board: "" });
  });
  if (!s.loaded)
    return (
      <Shell>
        <Skeleton className="mb-3.5 h-[110px]" />
        <Skeleton className="h-11" />
      </Shell>
    );
  if (!data)
    return (
      <Shell>
        <p className="text-muted-foreground">The icebox could not be read.</p>
      </Shell>
    );
  if (data.error || !d)
    return (
      <Shell>
        <p className="text-muted-foreground">{data.error}</p>
      </Shell>
    );
  const ctx: RowCtx = {
      list: d.list,
      many: d.many,
      boards: data.boards || [],
      cur: s.cur,
      sel: new Set(s.sel),
      open: s.open,
      armed: s.armed,
    },
    nSel = order.filter((it) => ctx.sel.has(iceKey(it))).length,
    capP = showable.find((p) => p.dir === to),
    capBoards = (data.boards || []).filter((b) => b.dir === to),
    groups = srcGroups(d.list, d.bySrc),
    hidden = hiddenCat(d.cat),
    nFilt = s.kinds.length + (d.cat ? 1 : 0) + (d.src ? 1 : 0),
    single = !!dir;
  const dialogs = (
    <>
      {s.ask?.kind === "collection" && <CollectionDialog where={s.ask.where} onDone={s.ask.done} />}
      {s.ask?.kind === "confirm" && (
        <ConfirmDialog
          open
          title={s.ask.title}
          description={s.ask.description}
          confirmLabel={s.ask.label}
          danger={s.ask.danger}
          onConfirm={() => s.ask?.kind === "confirm" && s.ask.done(true)}
          onCancel={() => s.ask?.kind === "confirm" && s.ask.done(false)}
        />
      )}
    </>
  );
  // Swipe: the waiting requests the filters show, one at a time.
  if (s.swipe)
    return (
      <Shell>
        <SwipeDeck list={d.list} dir={dir} name={(it) => pName(it, host.projects())} />
        <SourceDrawer data={data} dir={dir ?? ""} />
        {dialogs}
      </Shell>
    );
  const countText = hidden
    ? `${order.length} ${d.cat.toLowerCase()}`
    : `${order.length < d.waiting ? `${order.length} of ${d.waiting}` : d.waiting} waiting`;
  const inbox =
    d.waiting && !order.length ? (
      <Zero>
        <EmptyState title="No matches">
          <Button id="ice-unf" onClick={() => clearFilters(single)}>
            Clear filters
          </Button>
        </EmptyState>
      </Zero>
    ) : order.length ? (
      cardsOn ? (
        <>
          <div className="[columns:3_280px] [column-gap:12px]">
            {order.map((it) => (
              <RequestCard key={iceKey(it)} item={it} ctx={ctx} />
            ))}
          </div>
          <Pager at={pg.at} size={pg.size} total={pg.total} onAt={pg.setAt} onSize={pg.setSize} />
        </>
      ) : (
        <div
          className={`flex flex-col rounded-md border border-[color:color-mix(in_srgb,var(--line)_50%,transparent)] ${s.sel.length ? "rounded-t-none border-t-0" : ""}`}
        >
          {order.map((it) =>
            narrow ? (
              <RequestPhoneRow key={iceKey(it)} item={it} ctx={ctx} chat={chat} />
            ) : (
              <RequestRow key={iceKey(it)} item={it} ctx={ctx} chat={chat} />
            ),
          )}
          <Pager at={pg.at} size={pg.size} total={pg.total} onAt={pg.setAt} onSize={pg.setSize} />
        </div>
      )
    ) : (
      <Zero>
        <EmptyState
          title="Nothing waiting"
          help="Drop anything above: what a client asked for, something you found, what people say."
        >
          {!d.list.length && (
            <Button variant="primary" id="ice-addsrc" onClick={() => setIce({ srcShow: true })}>
              <Icon name="plus" className="size-3.5" /> Add a source
            </Button>
          )}
        </EmptyState>
      </Zero>
    );
  return (
    <Shell>
      <div className="mb-3 flex items-center gap-3 max-sm:flex-wrap">
        <span className="text-base font-semibold text-foreground">{countText}</span>
        <span className="flex-1" />
        <label className="relative flex w-72 items-center max-sm:order-last max-sm:w-full">
          <Icon name="search" className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <Input
            ref={(el) => void (iceEls.search = el)}
            type="search"
            value={s.q}
            onChange={(e) => setIce({ q: e.target.value })}
            onKeyDown={(e) => e.key === "Escape" && (setIce({ q: "" }), e.currentTarget.blur())}
            placeholder="Search icebox…"
            aria-label="Search the icebox"
            spellCheck={false}
            className="h-8 pl-8 pr-8 text-sm"
          />
          {!s.q && (
            <kbd className="pointer-events-none absolute right-2 rounded-xs border border-border px-1 text-[11px] text-muted-foreground max-sm:hidden">
              /
            </kbd>
          )}
        </label>
        {!narrow && (
          <Button
            id="src-tog"
            ref={(el) => void (iceEls.srcTog = el)}
            size="sm"
            aria-expanded={s.srcShow}
            aria-controls="src-sec"
            title="Sources, and Gather all"
            onClick={() => setIce({ srcShow: true })}
          >
            <Icon name="link" className="size-3.5" /> Sources · {d.list.length}
          </Button>
        )}
      </div>
      <CaptureBox
        to={to}
        projects={single ? [] : showable}
        boards={capBoards}
        board={s.cap.board && s.cap.boardDir && s.cap.boardDir !== to ? "" : s.cap.board}
      />
      {!narrow && data.gatherer?.use === "ask" && !chat && (
        <div className="mb-3 mt-1 flex flex-wrap items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-2))] px-4 py-3.5">
          <b className="text-[14px] text-strong">Gather social posts with ChatGPT?</b>
          <span className="flex-1" />
          <Button variant="ghost" onClick={() => void skipChatGPT()}>
            Skip
          </Button>
          <Button variant="primary" onClick={() => void connectChatGPT()}>
            Connect
          </Button>
        </div>
      )}
      <div className="mb-2.5 flex items-center justify-between gap-3 max-sm:-mx-4 max-sm:mb-1.5 max-sm:gap-1.5 max-sm:overflow-x-auto max-sm:px-4 max-sm:pb-0.5 max-sm:[scrollbar-width:none]">
        <div
          role="group"
          aria-label="Collections"
          className="flex min-w-0 flex-wrap items-center gap-1.5 max-sm:flex-none max-sm:flex-nowrap"
        >
          {!cardsOn && !narrow && order.length > 0 && (
            <Checkbox
              className="mr-1"
              aria-label="Select every request shown"
              checked={nSel > 0 && nSel === order.length ? true : nSel > 0 ? "indeterminate" : false}
              onCheckedChange={() => selectPage(order, nSel !== order.length)}
            />
          )}
          <Chip pressed={!d.board} onPressedChange={() => pickBoard("", d.boards, single)}>
            All
          </Chip>
          <Chip
            count={d.nInbox}
            pressed={d.board === INBOX}
            title="Items in no collection"
            onPressedChange={() => pickBoard(INBOX, d.boards, single)}
          >
            Inbox
          </Chip>
          {d.boards.map((b) => (
            <BoardChip
              key={b.name}
              board={b}
              count={d.nOn(b)}
              pressed={d.board.toLowerCase() === b.name.toLowerCase()}
              onPress={() => pickBoard(b.name, d.boards, single)}
            />
          ))}
          <IconButton
            id="ice-nb"
            icon="plus"
            label="New collection, for a client or a topic"
            className="size-[26px] [&_svg]:size-[13px]"
            onClick={() => void newCollection(to, single ? "" : capP?.label || "this project")}
          />
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Filter requests"
                className={nFilt ? "text-foreground" : "text-muted-foreground"}
              >
                <Icon name="filter" className="size-3.5" />
                {nFilt ? `Filter · ${nFilt}` : "Filter"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-64 flex-col gap-1 p-2">
              <b className="px-1.5 pt-1 text-xs font-medium text-muted-foreground">Kind</b>
              {Object.entries(KIND).map(([k, l]) => (
                <label
                  key={k}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-muted"
                >
                  <Checkbox checked={s.kinds.includes(k)} onCheckedChange={() => toggleKind(k)} />
                  <span className={KIND_TEXT[k]}>{l}</span>
                </label>
              ))}
              {(d.byCat.size > 1 || d.byCat.has("Dismissed") || d.byCat.has("Done") || d.byCat.has("Promoted")) && (
                <>
                  <b className="mt-1.5 px-1.5 text-xs font-medium text-muted-foreground">Category</b>
                  <Picker
                    label="Category"
                    value={d.cat}
                    placeholder="All categories"
                    options={[
                      { value: "", label: "All categories" },
                      ...[...d.byCat].map(([k, { n }]) => ({ value: k, label: k, count: n })),
                    ]}
                    onChange={(v) => setIce({ cat: v })}
                  />
                </>
              )}
              {d.bySrc.size > 1 && (
                <>
                  <b className="mt-1.5 px-1.5 text-xs font-medium text-muted-foreground">Source</b>
                  <Picker
                    label="Source"
                    value={d.src}
                    placeholder="All sources"
                    options={[
                      { value: "", label: "All sources" },
                      ...[...groups].flatMap(([g, xs]) =>
                        xs.map(([k, it]) => ({
                          value: k,
                          group: g,
                          label: subName(srcName(d.list, it), g),
                          search: srcName(d.list, it),
                          count: d.bySrc.get(k)!.n,
                          icon: <Favicon url={it.source} social={srcOf(d.list, it)?.social} size={15} />,
                        })),
                      ),
                    ]}
                    groupIcons={Object.fromEntries(
                      [...groups].map(([g, xs]) => [
                        g,
                        <Favicon key={g} url={xs[0]![1].source} social={srcOf(d.list, xs[0]![1])?.social} size={15} />,
                      ]),
                    )}
                    onChange={(v) => setIce({ src: v })}
                  />
                </>
              )}
              {nFilt > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 justify-start"
                  onClick={() => setIce({ kinds: [], cat: "", src: "" })}
                >
                  Clear filters
                </Button>
              )}
            </PopoverContent>
          </Popover>
          {!narrow && (
            <Segmented
              label="View"
              value={cardsOn ? "cards" : "sort"}
              options={[
                { id: "cards", label: "Cards" },
                { id: "sort", label: "List" },
              ]}
              onChange={setView}
            />
          )}
          <ActionMenu
            label="More"
            className="w-56"
            items={[
              ...(order.some(isWaiting)
                ? [{ id: "ice-sw", label: "Swipe through them", onSelect: startSwipe }]
                : []),
              ...(narrow ? [{ id: "src-tog", label: `Sources · ${d.list.length}`, onSelect: () => setIce({ srcShow: true }) }] : []),
              { id: "ice-nb2", label: "New collection…", onSelect: () => void newCollection(to, single ? "" : capP?.label || "this project") },
            ]}
          />
        </div>
      </div>
      {s.sel.length > 0 && (
        <BulkBar
          count={s.sel.length}
          busy={s.busy}
          onPromote={() => void bulkDo("promote")}
          onSnooze={() =>
            void snoozeAll(
              order.filter((it) => ctx.sel.has(iceKey(it)) && isLive(it)),
              "1w",
            )
          }
          onDismiss={() => void bulkDo("dismiss")}
          onClear={() => setIce({ sel: [] })}
        />
      )}
      {(data.failed || []).map((f) => (
        <p key={f} className="text-muted-foreground">
          The sources of {f} could not be read.
        </p>
      ))}
      {inbox}
      <SourceDrawer data={data} dir={dir ?? ""} />
      {dialogs}
    </Shell>
  );
}
// The page's one scroll area: it takes the board's page padding (28 px, 16 on a phone). The bottom space is a spacer,
// not padding: a sticky pager stops at a scroll area's padding, and the cards would show through the gap under it.
const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-0 flex-1 flex-col overflow-auto px-7 pt-6 max-[900px]:px-4">
    {children}
    <div aria-hidden className="h-6 shrink-0" />
  </div>
);
const Zero = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md border border-[color:color-mix(in_srgb,var(--line)_50%,transparent)]">{children}</div>
);
