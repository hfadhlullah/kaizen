import { ago, iceKey, isLive, short, srcName, srcOf, type IceItem, type RowCtx } from "../lib/icebox.ts";
import { setIce } from "../lib/icebox-store.ts";
import { toggleOpen, toggleSel } from "../lib/icebox-view.ts";
import { cn } from "../lib/utils.ts";
import { Checkbox } from "../ui/checkbox.tsx";
import { BoardMenu } from "./board-menu.tsx";
import { Favicon } from "./favicon.tsx";
import { KindLabel } from "./kind-label.tsx";
import { KindMenu } from "./kind-menu.tsx";
import { ProjectMark } from "./project-mark.tsx";
import { RequestActions } from "./request-actions.tsx";
import { RequestBadges } from "./request-badges.tsx";
import { RequestDetail } from "./request-detail.tsx";

const chipBtn =
  "-mx-1 -my-0.5 inline-flex max-w-[140px] items-center truncate rounded-xs px-1 py-0.5 hover:bg-muted data-[state=open]:bg-muted";
// One request in the Sort list: select, kind, where from, the words, then project, collection, age and what can be
// done (shown under the pointer, on the cursor row, or always on a touch screen). Opening it shows the rest.
export function RequestRow({ item, ctx, chat }: { item: IceItem; ctx: RowCtx; chat: boolean }) {
  const k = iceKey(item),
    open = ctx.open === k,
    cur = ctx.cur === k,
    sel = ctx.sel.has(k),
    live = isLive(item);
  return (
    <div>
      <div
        data-cur={cur || undefined}
        data-key={k}
        onFocusCapture={() => !cur && setIce({ cur: k })}
        onClick={(e) => {
          if (!(e.target as Element).closest("input,button,a,[role=checkbox],[role=menuitem]")) toggleOpen(item);
        }}
        className={cn(
          "group/row relative grid min-h-12 cursor-pointer grid-cols-[auto_86px_auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[color:color-mix(in_srgb,var(--line)_30%,transparent)] px-3 py-2 hover:bg-muted max-sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]",
          cur && "bg-muted shadow-[inset_0_0_0_1px_var(--line)]",
          sel && "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]",
          open && "rounded-t-sm bg-muted",
        )}
      >
        <Checkbox
          checked={sel}
          aria-label={`Select: ${item.text}`}
          onCheckedChange={() => {
            setIce({ cur: k });
            toggleSel(k);
          }}
        />
        {live ? (
          <KindMenu item={item}>
            <button type="button" aria-label={`Kind: ${item.text}`} title="Kind" className={chipBtn}>
              <KindLabel kind={item.kind} />
            </button>
          </KindMenu>
        ) : (
          <KindLabel kind={item.kind} />
        )}
        <span className="inline-flex items-center max-sm:hidden" title={srcName(ctx.list, item)}>
          <Favicon url={item.source} social={srcOf(ctx.list, item)?.social} size={14} />
        </span>
        <button
          type="button"
          data-title
          aria-expanded={open}
          title={item.text}
          onClick={() => toggleOpen(item)}
          className={cn("truncate bg-transparent py-1.5 text-left text-base text-foreground", open && "font-medium")}
        >
          {item.text}
        </button>
        <span className="inline-flex min-w-0 items-center gap-2.5 text-xs text-muted-foreground">
          {ctx.many && (
            <span
              className="inline-flex max-w-[140px] items-center gap-1.5 truncate max-sm:hidden"
              title={item.project || ""}
            >
              <ProjectMark dir={item.dir} label={item.project || ""} size={14} />
              {short(item.project || "")}
            </span>
          )}
          <RequestBadges item={item} />
          {live ? (
            <BoardMenu item={item} boards={ctx.boards}>
              <button
                type="button"
                aria-label={`Collection: ${item.text}`}
                title="Collection"
                className={cn(chipBtn, "text-xs max-sm:hidden", !item.board && "opacity-70")}
              >
                {item.board || "Inbox"}
              </button>
            </BoardMenu>
          ) : (
            item.board && <span className="max-sm:hidden">{item.board}</span>
          )}
          <span className="min-w-16 whitespace-nowrap text-right tabular-nums group-focus-within/row:hidden group-hover/row:hidden group-data-[cur]/row:hidden [@media(hover:none)]:hidden">
            {ago(item.at)}
          </span>
          <RequestActions
            item={item}
            boards={ctx.boards}
            variant="row"
            className="hidden min-w-16 justify-end group-focus-within/row:flex group-hover/row:flex group-data-[cur]/row:flex [@media(hover:none)]:flex"
          />
        </span>
      </div>
      {open && <RequestDetail item={item} ctx={ctx} chat={chat} />}
    </div>
  );
}
