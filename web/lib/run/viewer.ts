// Files the board links to (attachments, Preview screenshots, icebox images) open in a popup over the board rather than
// a new tab. components/run/file-viewer.tsx catches the click and draws the popup.
import { create } from "zustand";

const IMG = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;
export const useViewer = create<{ file: { href: string; name: string } | null }>()(() => ({ file: null }));
// Only the board's own file routes open here; anything else is left to the browser.
export const viewable = (href: string) => /^\/(file|ice-image)\?/.test(href);
export const fileName = (href: string) => new URLSearchParams(href.split("?")[1]).get("p")?.split("/").pop() ?? "Image";
export const isImage = (href: string, name: string) => href.startsWith("/ice-image") || IMG.test(name);
export const openFile = (href: string) => useViewer.setState({ file: { href, name: fileName(href) } });
export const closeFile = () => useViewer.setState({ file: null });
