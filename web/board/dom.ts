// Small DOM helpers every part of the board uses.
export const $ = <T extends HTMLElement = any>(id: string) => document.getElementById(id) as T;
export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// Trusted markup. Everything `html` interpolates is escaped unless it is a Safe.
export class Safe {
  constructor(readonly s: string) {}
  toString() {
    return this.s;
  }
}
export const raw = (s) => new Safe(String(s));
const part = (v): string => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join("") : v == null || v === false ? "" : esc(v));
// Escape-by-default template: html`<b>${title}</b>` cannot inject markup. Keep attributes double-quoted.
export const html = (strs: TemplateStringsArray, ...vals) => raw(strs.reduce((a, s, i) => a + part(vals[i - 1]) + s));
export const ico = (n) => raw(`<svg><use href="#i-${n}"/></svg>`);
// Placeholder rows for a panel whose body is still being fetched.
export const SKEL = raw(
  '<div aria-busy="true" aria-label="Loading">' +
  '<span class="skel" style="height:16px;width:35%;margin:20px 0 14px"></span>' +
  '<span class="skel" style="height:44px;margin-bottom:10px"></span>'.repeat(4) +
  "</div>",
);
// A phone photo is many MB and a few of them pass the server's cap; a big raster image
// goes up as a JPEG of at most 2560px a side. Anything that will not decode goes as is.
const MAX_IMG = 1_500_000;
async function shrink(x: File): Promise<File> {
  if (x.size <= MAX_IMG || !/^image\/(jpeg|png|webp|bmp|heic|heif)$/.test(x.type)) return x;
  try {
    const bm = await createImageBitmap(x);
    const k = Math.min(1, 2560 / Math.max(bm.width, bm.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bm.width * k);
    c.height = Math.round(bm.height * k);
    c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return b && b.size < x.size ? new File([b], x.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : x;
  } catch {
    return x;
  }
}
// Files as {name, data-URL}, the shape /note and /icebox take.
export const dataUrls = (files: File[]) =>
  Promise.all(
    files.map(
      async (f) => {
        const x = await shrink(f);
        return new Promise<{ name: string; data: string }>((res) => {
          const rd = new FileReader();
          rd.onload = () => res({ name: x.name, data: rd.result as string });
          rd.readAsDataURL(x);
        });
      },
    ),
  );
// A modal form: the native <dialog>, removed from the page once closed.
export function modal(body: string | Safe) {
  const dl = document.createElement("dialog");
  dl.className = "kz";
  dl.innerHTML = `<form class="inl" method="dialog">${body}</form>`;
  dl.onclose = () => dl.remove();
  // A tap on the backdrop. Braces matter: an on* handler that returns false cancels the click,
  // which stopped every submit button inside the form.
  dl.onclick = (e) => {
    if (e.target === dl) dl.close();
  };
  document.body.appendChild(dl);
  dl.showModal();
  return dl;
}

// Motion: the Settings choice (data-motion on <html>), else the system's reduced-motion.
export const motion = () => {
  const m = document.documentElement.dataset.motion;
  return m ? m === "full" : !matchMedia("(prefers-reduced-motion: reduce)").matches;
};
// fn as a view transition where the browser has them and motion is on; resolves once the DOM is updated.
export const vt = (fn: () => void): Promise<void> =>
  motion() && document.startViewTransition ? document.startViewTransition(fn).updateCallbackDone : (fn(), Promise.resolve());
