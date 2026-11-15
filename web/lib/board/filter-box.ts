// The search box of the Board (the header's) and of Tasks (the page's own): each registers itself while it is mounted, and the
// `/` key focuses the one that shows.
const boxes = new Set<HTMLInputElement>();
export const filterBoxes = {
  add: (el: HTMLInputElement) => (boxes.add(el), () => void boxes.delete(el)),
};
export const focusFilter = () => [...boxes].find((el) => el.offsetParent !== null)?.focus();
