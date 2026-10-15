import { store } from "./store.ts";
import { $, el, icon, toast } from "./dom.ts";

// ---- attachments: text files are read here and sent inside the message, after a marker
// the thread draws as a chip. Images are not sent yet. ----
const ATTACH = "\n\n--- Attached: ",
  MAX_FILE = 200_000,
  MAX_ALL = 280_000;

export function renderChips() {
  $("chips").replaceChildren(
    ...store.attached.map((f, i) =>
      el(
        "span",
        { class: "chip" },
        `📎 ${f.name}`,
        el(
          "button",
          {
            type: "button",
            "aria-label": `Remove ${f.name}`,
            onclick: () => {
              store.attached.splice(i, 1);
              renderChips();
            },
          },
          "✕",
        ),
      ),
    ),
  );
}
// A user message is the typed text, then each file after the marker.
export const withFiles = (text) => text + store.attached.map((f) => `${ATTACH}${f.name} ---\n${f.content}`).join("");
export const splitFiles = (text) => {
  const parts = text.split(ATTACH);
  return { text: parts[0], files: parts.slice(1).map((p) => p.slice(0, p.indexOf(" ---"))) };
};

export function initAttachments() {
  icon($("attach"), "plus").onclick = () => $("files").click();
  $("files").onchange = async (e) => {
    for (const file of e.target.files) {
      const isText =
        file.type.startsWith("text/") ||
        /\.(txt|md|markdown|csv|tsv|json|log|ya?ml|xml|html|ics|eml)$/i.test(file.name);
      if (!isText) {
        toast(`${file.name}: only text files can be attached for now`);
        continue;
      }
      if (file.size > MAX_FILE) {
        toast(`${file.name} is over 200 KB`);
        continue;
      }
      const content = await file.text();
      if (store.attached.reduce((n, f) => n + f.content.length, 0) + content.length > MAX_ALL) {
        toast("That is more than one message can carry");
        break;
      }
      store.attached.push({ name: file.name.replace(/\s*---\s*/g, " "), content });
    }
    e.target.value = "";
    renderChips();
    $("input").focus();
  };
}
