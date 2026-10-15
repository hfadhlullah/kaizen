import { store } from "./store.ts";
import { renderChips, withFiles } from "./attachments.ts";
import { $, toast } from "./dom.ts";
import { notify } from "./live.ts";
import { renderRoutines } from "./panel.ts";
import { doingText, loadBots, renderList, working } from "./sidebar.ts";
import { addMsg, showDoing, upsert } from "./thread.ts";

async function send() {
  const typed = $("input").value.trim();
  if ((!typed && !store.attached.length) || !store.current || working.has(store.current.id)) return;
  const text = withFiles(typed);
  const bot = store.current,
    botId = bot.id;
  if (bot.notify && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
  working.add(botId);
  doingText.set(botId, "Thinking…");
  renderList();
  showDoing("Thinking…");
  $("input").value = "";
  $("input").style.height = "auto";
  store.attached = [];
  renderChips();
  try {
    const res = await fetch(`/bots/${botId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(chunk)?.[1],
          data = JSON.parse(/^data: (.*)$/m.exec(chunk)?.[1] || "{}");
        const here = store.current?.id === botId;
        if (ev === "status") {
          doingText.set(botId, data.text);
          if (here) showDoing(data.text);
        } else if (ev === "message" && here) {
          store.items.push({ type: "m", at: data.at, m: data });
          addMsg(data);
          $("thread").scrollTop = $("thread").scrollHeight;
        }
        if (
          ev === "message" &&
          here &&
          store.panel === "agent" &&
          data.kind === "receipt" &&
          /^Routine → (created|deleted) /.test(data.text)
        )
          renderRoutines();
        else if (ev === "action") {
          upsert(data);
          $("thread").scrollTop = $("thread").scrollHeight;
          if (data.status === "needed") notify(bot, "needs you", data.summary);
        }
      }
    }
    notify(bot, "finished", "Your turn.");
  } catch (err) {
    toast(`Couldn't send: ${err.message}`);
  } finally {
    working.delete(botId);
    doingText.delete(botId);
    if (store.current?.id === botId) showDoing(null);
    loadBots();
  }
}

export function initComposer() {
  // ---- composer: Enter sends, Shift+Enter is a new line; no Send button ----
  $("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  $("input").addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  });
  $("composer").onsubmit = (e) => {
    e.preventDefault();
    send();
  };
}
