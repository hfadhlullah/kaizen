import { newChat, openHome as open, popOut, setSide, syncHere, takeHandoff, useHome } from "@lib/home";
import { $ } from "./dom.ts";
import { see } from "@lib/shell";

// ---- Home: a chat with kaizen's main agent (cli/chat.ts). The page is React (pages/home-page.tsx, state and requests in
// lib/home/home-store.ts); this file wires what stays in the board's own header: the chat-list toggle on a phone, New chat and
// Pop out, and keeps Home following the board's project.
let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  $("hsidetop").onclick = () => setSide(!useHome.getState().side);
  $("hnewtop").onclick = newChat;
  $("hpop").onclick = () => void popOut();
  // The header buttons follow the page's state: the toggle names what it does, New chat waits for a reply to end.
  const sync = (s = useHome.getState()) => {
    const t = $("hsidetop");
    t.setAttribute("aria-expanded", String(s.side));
    t.title = s.side ? "Hide chats" : "Show chats";
    ($("hnewtop") as HTMLButtonElement).disabled = s.sending;
  };
  useHome.subscribe(sync);
  sync();
}

// The Home view opens: every chat, and the open one kept.
export function openHome() {
  see("home");
  wire();
  return open();
}

// Back from the popup (`kaizen chat`): the server brings this window back and hands over the chat the popup was on; Home
// opens it. A browser window coming back from a hidden Hyprland workspace fires no focus event, so Home asks every 1.5 s.
// ponytail: polling; push it through the board's state stream if this ever costs anything.
if (typeof document !== "undefined")
  setInterval(() => globalThis.document?.body?.classList.contains("homev") && void takeHandoff(), 1500);

// A project picked above: a new chat's greeting names it.
addEventListener("kz-state", () => document.body.classList.contains("homev") && syncHere());
