import { useEffect, type RefObject } from "react";

// The board's own header controls (the search box, the New task button, the tools slot) are moved into a React
// page while it shows and put back, at their old place, when it goes. `ids` are element ids; the page's slots
// are given in the same order.
export function useDock(slots: RefObject<HTMLElement | null>[], ids: string[]) {
  useEffect(() => {
    const marks: [Comment, HTMLElement][] = [];
    ids.forEach((id, i) => {
      const el = document.getElementById(id),
        to = slots[i]?.current;
      if (!el || !to) return;
      const mark = new Comment();
      el.before(mark);
      marks.push([mark, el]);
      to.append(el);
    });
    return () => marks.forEach(([mark, el]) => mark.replaceWith(el));
  }, []);
}
