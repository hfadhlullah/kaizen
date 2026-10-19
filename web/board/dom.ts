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
