// Half-typed text outlives a redraw and a page reload. Per tab, so two tabs cannot
// overwrite each other; form drafts are under "f:", notes under "n:".
export const DK = "kz-d:";
export function draft(el, k) {
  try {
    const v = sessionStorage.getItem(DK + k);
    if (v != null) el.value = v;
  } catch (e) {}
  el.addEventListener("input", () => {
    try {
      sessionStorage.setItem(DK + k, el.value);
    } catch (e) {}
  });
}
export function undraft(p) {
  try {
    Object.keys(sessionStorage).forEach((k) => {
      if (k.startsWith(DK + p)) sessionStorage.removeItem(k);
    });
  } catch (e) {}
}
