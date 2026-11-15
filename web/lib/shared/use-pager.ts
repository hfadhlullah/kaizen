import { useState } from "react";

// Paging for a long list: the size is remembered per browser under kz-page:<id>; a list that shrank pulls the
// page back into range.
export const PAGE_SIZES = [5, 25, 50, 100];
export function usePager<T>(id: string, items: T[]) {
  const [size, setSizeState] = useState(() => {
    try {
      const n = Number(localStorage.getItem("kz-page:" + id));
      if (PAGE_SIZES.includes(n)) return n;
    } catch {}
    return 25;
  });
  const [want, setAt] = useState(0);
  const at = Math.max(0, Math.min(want, Math.ceil(items.length / size) - 1));
  const setSize = (n: number) => {
    setSizeState(n);
    setAt(0);
    try {
      localStorage.setItem("kz-page:" + id, String(n));
    } catch {}
  };
  return { rows: items.slice(at * size, (at + 1) * size), at, size, total: items.length, setAt, setSize };
}
