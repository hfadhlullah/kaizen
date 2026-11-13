import { FOLD, HINT, backlogCards, cardKey, columnCards, olderThan, type Card } from "../lib/board.ts";
import { archiveMany } from "../lib/board-actions.ts";
import { closeForm, flipOrder, openForm, setBoard, setTab, useBoard } from "../lib/board-store.ts";
import { toast } from "../lib/toast.ts";
import { Button } from "../ui/button.tsx";
import { Icon } from "../ui/icon.tsx";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs.tsx";
import { BoardCard } from "./board-card.tsx";
import { CardForm } from "./card-form.tsx";
import { ClearMenu } from "./clear-menu.tsx";
import { IconButton } from "./icon-button.tsx";
import { RunForm } from "./run-form.tsx";
import { SeverityMenu } from "./severity-menu.tsx";
import { TaskForm } from "./task-form.tsx";

// One column of the Board: its title (Tasks has two tabs, To do and Backlog), sort order, the cards, "Show N more",
// and a hint when it is empty. A card being edited, rejected, deleted, moved or run is replaced by its form.
export function BoardColumn({ ci }: { ci: number }) {
  const snap = useBoard((s) => s.snap)!,
    { tab, sev, order, picking, picked, unfolded, form } = useBoard();
  const tabbed = ci === 0 && !snap.archive,
    bl = tabbed && tab === "backlog",
    shownOnly = (c: Card) => !snap.only || snap.only.includes(c.state),
    backlog = backlogCards(snap.backlogItems).filter(shownOnly),
    list = columnCards({
      cards: snap.cards,
      backlog,
      ci,
      archive: snap.archive,
      filter: snap.filter,
      query: snap.query,
      tab,
      sev,
      order,
      all: snap.allCards,
    }),
    clearable = ci === 4 && !snap.archive && list.length > 0,
    older = (days: number) => olderThan(list, snap.now, days),
    fold = unfolded.includes(ci) || list.length <= FOLD + 1 ? list : list.slice(0, FOLD),
    formCard = (c: Card) => form && form.key === cardKey(c) && form.mode !== "new";
  const clear = async (days: number) => {
    const set = older(days);
    if (!set.length) return void toast("Nothing that old");
    await archiveMany(set);
  };
  const pickGo = async () => {
    const set = list.filter((c) => picked.includes(cardKey(c)));
    setBoard({ picking: false, picked: [] });
    await archiveMany(set);
  };
  const togglePick = (k: string) =>
    setBoard({ picked: picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k] });
  const unfold = (on: boolean) => setBoard({ unfolded: on ? [...unfolded, ci] : unfolded.filter((x) => x !== ci) });
  const done = () => closeForm();
  return (
    <section className="pt-2" aria-labelledby={`col-${ci}`}>
      <h2
        id={`col-${ci}`}
        className="sticky top-0 z-[1] flex h-8 items-center gap-2 bg-background px-0.5 text-[13px] font-medium shadow-[0_-12px_0_var(--bg)]"
      >
        {tabbed ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "ideas" | "backlog")}>
            <TabsList aria-label="To do column">
              <TabsTrigger value="ideas" title="To do" aria-label="To do">
                <Icon sprite="s" name="idea" className="size-3.5 stroke-[1.7]" />
                {tab === "ideas" && <b className="font-[inherit]">To do</b>}
              </TabsTrigger>
              <TabsTrigger
                value="backlog"
                title="Backlog: what finished runs left undone"
                aria-label="Backlog: what finished runs left undone"
              >
                <Icon name="clock" className="size-3.5 stroke-[1.7]" />
                {tab === "backlog" && <b className="font-[inherit]">Backlog</b>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : (
          <>
            {snap.colNames[ci]}
            <i className="text-xs font-normal not-italic text-muted-foreground empty:hidden">{list.length || ""}</i>
          </>
        )}
        {ci < 4 && !bl && list.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[22px] px-2 font-medium"
            title="Sort order"
            onClick={() => flipOrder(ci)}
          >
            {order[ci] === "old" ? "Oldest" : "Newest"}
          </Button>
        )}
        {bl && <SeverityMenu value={sev} items={backlog} onChange={(v) => setBoard({ sev: v })} />}
        {tabbed && (
          <IconButton
            icon="plus"
            label="New task"
            className={`size-(--btn-xs) [&_svg]:size-4 ${bl ? "" : "ml-auto"}`}
            onClick={() => (setTab("ideas"), openForm({ mode: "new" }))}
          />
        )}
        {clearable && picking && (
          <span className="ml-auto flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[22px] px-2"
              onClick={() => setBoard({ picking: false, picked: [] })}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="min-h-[22px] px-2"
              disabled={!picked.length}
              onClick={() => void pickGo()}
            >
              Archive {picked.length || ""}
            </Button>
          </span>
        )}
        {clearable && !picking && (
          <ClearMenu
            counts={[older(7).length, older(3).length, list.length]}
            onClear={(d) => void clear(d)}
            onPick={() => setBoard({ picking: true, picked: [] })}
          />
        )}
      </h2>
      <ul className="flex flex-col gap-1.5 pt-1">
        {ci === 0 && form?.mode === "new" && (
          <li>
            <TaskForm inline picking={snap.all || snap.phone} preset={null} choose={false} onDone={done} />
          </li>
        )}
        {fold.map((c) => {
          const k = cardKey(c);
          if (formCard(c))
            return (
              <li key={k}>
                {form!.mode === "run" ? (
                  <RunForm card={c} inline onDone={done} />
                ) : (
                  <CardForm card={c} mode={form!.mode as "edit"} inline onDone={done} />
                )}
              </li>
            );
          return (
            <li key={k}>
              <BoardCard
                card={c}
                pick={picking && !snap.archive && c.column === 4}
                picked={picked.includes(k)}
                onPick={() => togglePick(k)}
              />
            </li>
          );
        })}
        {fold.length < list.length && (
          <li>
            <button
              type="button"
              className="w-full rounded-full p-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => unfold(true)}
            >
              Show {list.length - fold.length} more
            </button>
          </li>
        )}
        {fold.length >= list.length && unfolded.includes(ci) && list.length > FOLD + 1 && (
          <li>
            <button
              type="button"
              className="w-full rounded-full p-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => unfold(false)}
            >
              Show less
            </button>
          </li>
        )}
        {!list.length &&
          ci <= 3 &&
          !bl &&
          snap.cards.length > 0 &&
          !snap.filter &&
          !snap.query.trim() &&
          !snap.archive &&
          !(ci === 0 && form?.mode === "new") && <li className={hint}>{HINT[ci]}</li>}
        {bl && !list.length && !snap.filter && !snap.query.trim() && (
          <li className={hint}>{sev ? "Nothing at this severity" : "What finished runs left undone shows here"}</li>
        )}
      </ul>
    </section>
  );
}
const hint = "block rounded-sm border border-dashed border-border p-3.5 text-center text-sm text-muted-foreground";
