// Small DOM helpers every part of the board uses.
export const $ = <T extends HTMLElement = any>(id: string) => document.getElementById(id) as T;
export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const ico = (n) => `<svg><use href="#i-${n}"/></svg>`;
// Placeholder rows for a panel whose body is still being fetched.
export const SKEL =
  '<div aria-busy="true" aria-label="Loading">' +
  '<span class="skel" style="height:16px;width:35%;margin:20px 0 14px"></span>' +
  '<span class="skel" style="height:44px;margin-bottom:10px"></span>'.repeat(4) +
  "</div>";
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
export function modal(html: string) {
  const dl = document.createElement("dialog");
  dl.className = "kz";
  dl.innerHTML = `<form class="inl" method="dialog">${html}</form>`;
  dl.onclose = () => dl.remove();
  dl.onclick = (e) => e.target === dl && dl.close(); // a tap on the backdrop
  document.body.appendChild(dl);
  dl.showModal();
  return dl;
}
