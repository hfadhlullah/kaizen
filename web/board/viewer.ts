// Files the board links to (attachments, Preview screenshots, icebox images) open in a
// popup over the board rather than a new tab. Ctrl/Cmd/Shift or a middle click still
// gets the browser's own tab; external links are not files and are left alone.
const IMG = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;

export function initViewer() {
  const dlg = document.createElement("dialog");
  dlg.className = "kz viewer";
  document.body.append(dlg);
  // A click on the backdrop lands on the dialog itself, not its contents.
  dlg.addEventListener("click", (e) => e.target === dlg && dlg.close());
  dlg.addEventListener("close", () => dlg.replaceChildren());

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
    const href = a?.getAttribute("href") ?? "";
    if (!/^\/(file|ice-image)\?/.test(href)) return;
    e.preventDefault();
    const name = new URLSearchParams(href.split("?")[1]).get("p")?.split("/").pop() ?? "Image";
    const head = document.createElement("div");
    head.className = "viewer-hd";
    const title = document.createElement("span");
    title.textContent = name;
    const tab = document.createElement("a");
    tab.href = href;
    tab.target = "_blank";
    tab.rel = "noopener";
    tab.textContent = "Open in new tab";
    const x = document.createElement("button");
    x.className = "btn sm";
    x.textContent = "Close";
    x.onclick = () => dlg.close();
    head.append(title, tab, x);
    const body =
      href.startsWith("/ice-image") || IMG.test(name)
        ? document.createElement("img")
        : document.createElement("iframe");
    body.src = href;
    if (body instanceof HTMLImageElement) {
      body.alt = name;
      body.referrerPolicy = "no-referrer";
    }
    dlg.replaceChildren(head, body);
    dlg.showModal();
  });
}
