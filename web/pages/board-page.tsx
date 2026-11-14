import { useEffect } from "react";
import { backlogCards, cardKey, host } from "../lib/core/index.ts";
import { closeForm, useBoard } from "../lib/board/index.ts";
import { Button } from "../ui/button.tsx";
import { BoardColumn, WsCard } from "../components/board/index.ts";

// The Board, drawn into #board (a grid the old page keeps). Runs mode is five columns of cards; Workspaces mode is four
// columns of workspace cards. The old board code (web/board/cards.ts render()) feeds it a snapshot on every change;
// nothing here is rebuilt by hand, so an open menu or a half-typed form is never lost to a refresh.
export function BoardPage() {
  const snap = useBoard((s) => s.snap),
    form = useBoard((s) => s.form);
  // A form whose card is gone (restored after a reload, or deleted elsewhere) has nowhere to show.
  useEffect(() => {
    if (!snap || !form || form.mode === "new") return;
    if (![...snap.allCards, ...backlogCards(snap.backlogItems)].some((c) => cardKey(c) === form.key)) closeForm();
  }, [snap, form]);
  if (!snap) return null;
  if (snap.mode === "ws")
    return (
      <>
        {snap.wsNames.map((n, i) => (
          <section key={n} className="pt-2">
            <h2 className="sticky top-0 z-[1] flex h-8 items-center gap-2 bg-background px-0.5 text-[13px] font-medium shadow-[0_-12px_0_var(--bg)]">
              {n}{" "}
              <i className="text-xs font-normal not-italic text-muted-foreground empty:hidden">
                {snap.ws[i]!.length || ""}
              </i>
            </h2>
            <div className="flex flex-col gap-1.5">
              {snap.ws[i]!.map((w) => (
                <WsCard key={w.dir + w.path} w={w} />
              ))}
              {!snap.ws[i]!.length && <p className="px-0.5 py-2 text-sm text-muted-foreground">Empty</p>}
            </div>
          </section>
        ))}
      </>
    );
  return (
    <>
      {!snap.cards.length && form?.mode !== "new" && (
        <div className="col-span-full flex flex-col items-center gap-3 py-[60px] text-center text-muted-foreground">
          <b className="text-[16px] font-semibold text-foreground">
            {snap.archive ? "Nothing archived" : "Nothing here yet"}
          </b>
          {!snap.archive && (
            <>
              <p className="mb-1.5 max-w-[44ch]">Add a task and kaizen will plan it, build it, and check the result.</p>
              <Button variant="primary" onClick={() => host.newTask()}>
                New task
              </Button>
            </>
          )}
        </div>
      )}
      {[0, 1, 2, 3, 4].map((ci) => (
        <BoardColumn key={ci} ci={ci} />
      ))}
    </>
  );
}
