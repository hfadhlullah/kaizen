import { store } from "./store.ts";
import { api } from "./api.ts";
import { $ } from "./dom.ts";
import { renderNeeds } from "./needs.ts";
import { loadBoard, renderRoutines } from "./panel.ts";
import { bots, doingText, loadBots, renderList, routineBusy, working } from "./sidebar.ts";
import { addMsg, showDoing, upsert } from "./thread.ts";

// ---- notifications: only while the tab is open but hidden, for agents that want them ----
export function notify(bot, what, body) {
  if (!bot?.notify || !document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(`${bot.name} ${what}`, { body: String(body || "").slice(0, 140), tag: `kbot-${bot.id}` });
  } catch {}
}

// ---- live events: cards, board status, runs waiting on you ----
export const liveFrames = new Map(); // computer card id -> its latest { at, step }
export const liveImgs = new Map(); // computer card id -> the <img> playing its live.mjpeg
let opened = 0;
async function refreshCards() {
  if (store.current)
    try {
      (await api(`/bots/${store.current.id}/messages`)).actions.forEach(upsert);
    } catch {}
}
export function listen() {
  const es = new EventSource("/events");
  es.addEventListener("action", (e) => {
    const a = JSON.parse(e.data);
    upsert(a);
    loadBots();
    if (store.needsOpen) renderNeeds();
    if (a.status === "needed" && a.snapshot?.launched)
      notify(
        bots.find((b) => b.id === a.bot_id),
        "has a run waiting on you",
        a.summary,
      );
  });
  es.addEventListener("frame", (e) => {
    const f = JSON.parse(e.data);
    liveFrames.set(f.id, f);
    const img = liveImgs.get(f.id),
      step = document.getElementById(`step-${f.id}`);
    if (img && !img.src) {
      img.src = `/actions/${f.id}/live.mjpeg`;
      img.hidden = false;
    }
    if (step && f.step) step.textContent = f.step;
  });
  es.addEventListener("board", (e) => {
    const ok = JSON.parse(e.data).ok;
    if (ok !== store.board.ok) loadBoard();
  });
  // A routine's turn: no send() stream is open for it, so its messages and status come here.
  es.addEventListener("msg", (e) => {
    const m = JSON.parse(e.data),
      bot = bots.find((b) => b.id === m.bot_id);
    if (store.current?.id === m.bot_id) {
      store.items.push({ type: "m", at: m.at, m });
      addMsg(m);
      $("thread").scrollTop = $("thread").scrollHeight;
    }
    if (m.kind === "bot") notify(bot, "posted", m.text);
    loadBots();
  });
  const routineDone = (id) => {
    routineBusy.delete(id);
    working.delete(id);
    doingText.delete(id);
    if (store.current?.id === id) {
      showDoing(null);
      if (store.panel === "agent") renderRoutines();
    }
  };
  es.addEventListener("status", (e) => {
    const s = JSON.parse(e.data);
    if (s.text) {
      routineBusy.add(s.bot_id);
      working.add(s.bot_id);
      doingText.set(s.bot_id, s.text);
      if (store.current?.id === s.bot_id) showDoing(s.text);
    } else routineDone(s.bot_id);
    renderList();
  });
  // A dropped stream may have lost a routine's final status; don't leave its agent stuck as working.
  // Card events sent while the stream was down are lost: refetch this chat's cards on reconnect.
  es.addEventListener("open", () => {
    if (routineBusy.size) {
      [...routineBusy].forEach(routineDone);
      renderList();
    }
    if (opened++) refreshCards();
  });
  es.addEventListener("waiting", (e) => {
    const w = JSON.parse(e.data);
    notify(
      bots.find((b) => b.id === w.botId),
      "has a run waiting on you",
      `${w.run} in ${w.project}`,
    );
  });
}

export function initLive() {
  // A running computer task is re-read every 5 s too, so a lost event never leaves its card stale.
  setInterval(() => {
    if (store.items.some((x) => x.type === "a" && x.a.kind === "computer" && x.a.status === "working")) refreshCards();
  }, 5000);
}
