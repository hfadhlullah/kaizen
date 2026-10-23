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
// Files as {name, data-URL}, the shape /note and /icebox take.
export const dataUrls = (files: File[]) =>
  Promise.all(
    files.map(
      (x) =>
        new Promise<{ name: string; data: string }>((res) => {
          const rd = new FileReader();
          rd.onload = () => res({ name: x.name, data: rd.result as string });
          rd.readAsDataURL(x);
        }),
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
