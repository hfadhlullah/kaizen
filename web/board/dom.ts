// Small DOM helpers every part of the board uses.
export const $ = <T extends HTMLElement = any>(id: string) => document.getElementById(id) as T;
export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const ico = (n) => `<svg><use href="#i-${n}"/></svg>`;
