// Leaving for another address. A page with work not yet written (the Notebook's open note: its autosave waits 600 ms)
// registers a writer; `leave` runs every writer, then goes.
const writers: (() => Promise<unknown>)[] = [];
export const onLeave = (write: () => Promise<unknown>) => void writers.push(write);
export function leave(href: string) {
  void Promise.allSettled(writers.map((w) => w())).then(() => (location.href = href));
}
