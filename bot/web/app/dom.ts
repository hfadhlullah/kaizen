// All server, board and model text reaches the page through textContent (el() below), never innerHTML.
// The only HTML insertion is ICONS: constant strings defined here.
const ICONS = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
  panel: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M15 5v14"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="4" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3"/></svg>',
};
export const icon = (node, name) => {
  node.replaceChildren();
  node.insertAdjacentHTML("afterbegin", ICONS[name]);
  return node;
};

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "style") Object.assign(n.style, v);
    else if (k === "value") n.value = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat())
    if (k != null && k !== false) n.append(typeof k === "string" ? document.createTextNode(k) : k);
  return n;
}
export const $ = (id) => document.getElementById(id);
export const toast = (t) => {
  const n = el("div", { class: "toast", role: "status" }, t);
  document.body.append(n);
  setTimeout(() => n.remove(), 4000);
};
export const avatar = (b, cls = "") =>
  el(
    "div",
    { class: `av ${cls}`, style: { background: b.color }, "aria-hidden": "true" },
    (b.name || "?").trim()[0].toUpperCase(),
  );
export const initials = (s) =>
  s
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
