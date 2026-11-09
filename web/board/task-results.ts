// Typed task outputs. Only server-issued artifact routes are embedded; live URLs are
// separate, mutable references and active HTML/SVG files remain downloads.
import { html, raw, type Safe } from "./dom.ts";

export type TaskArtifact = {
  id: string;
  name: string;
  kind: string;
  mediaType?: string;
  preview?: string | boolean;
  url?: string;
  size?: number;
  missing?: boolean;
  source?: string;
};
export type TaskResult = {
  id: string;
  title?: string;
  summary?: string;
  createdAt?: number | string;
  artifacts: TaskArtifact[];
  checks?: (string | { label?: string; outcome?: string; evidence?: string })[];
  limitations?: string[];
  liveUrl?: string;
  storedSize?: number;
  size?: number;
};
export const webUrl = (value: unknown) => {
  try {
    const u = new URL(String(value));
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
};
export const storedUrl = (value: unknown) =>
  typeof value === "string" && /^\/task-artifact(?:\?|\/)/.test(value) && !value.includes("\\") && !/[\r\n]/.test(value)
    ? value
    : null;
export const sizeLabel = (n?: number) =>
  n == null
    ? ""
    : n < 1024
      ? `${n} B`
      : n < 1024 * 1024
        ? `${(n / 1024).toFixed(1)} KB`
        : `${(n / (1024 * 1024)).toFixed(1)} MB`;
export function artifactView(a: TaskArtifact, selected = false): Safe {
  const url = storedUrl(a.url),
    live = a.kind === "website" || a.kind === "app" || a.kind === "link" || a.kind === "live";
  const href = live ? webUrl(a.url) : url;
  const active =
    /^(?:text\/(?:html|javascript|xml)|application\/(?:javascript|xml|xhtml\+xml)|image\/svg\+xml)(?:;|$)/i.test(
      a.mediaType ?? "",
    ) || /\.(html?|svg|m?js|xml)$/i.test(a.name);
  let view: Safe | string = "";
  if (a.missing || !href)
    view = html`<p class="tp-limit">
      ${a.missing ? "This saved file is unavailable." : "No preview is available for this output."} Ask for the file
      again or inspect the technical details.
    </p>`;
  else if (selected && live)
    view = html`<p class="tp-limit">Live preview — this address can change during later work.</p>
      <iframe
        class="tp-web"
        data-live-url="${href}"
        title="Live preview of ${a.name}"
        sandbox="allow-forms allow-scripts allow-popups"
        referrerpolicy="no-referrer"
      ></iframe>
      <p class="dim" data-live-status>Checking preview availability… You can also use Open link.</p>`;
  else if (selected && !active && a.preview !== false && a.preview !== "download" && a.preview !== "none") {
    if (/^image\//.test(a.mediaType ?? "") || a.kind === "image" || a.kind === "screenshot")
      view = html`<img class="tp-image" src="${href}" alt="${a.name}" loading="lazy" />`;
    else if (/^video\//.test(a.mediaType ?? "") || a.kind === "video")
      view = html`<video class="tp-media" controls preload="metadata" src="${href}">
        Download this video to watch it.
      </video>`;
    else if (/^audio\//.test(a.mediaType ?? "") || a.kind === "audio")
      view = html`<audio class="tp-media" controls preload="metadata" src="${href}">
        Download this audio to listen.
      </audio>`;
    else if (a.mediaType === "application/pdf" || a.kind === "pdf")
      view = html`<iframe class="tp-document" src="${href}" title="${a.name}" sandbox></iframe>
        <p class="dim">Your browser may need you to download this PDF.</p>`;
    else if (/^text\//.test(a.mediaType ?? "") || ["text", "markdown", "document"].includes(a.kind))
      view = html`<pre class="tp-text" data-text-artifact="${href}" aria-label="${a.name}">Loading saved text…</pre>`;
    else view = html`<p class="dim">Preview is unavailable for this format. Download to open it in your app.</p>`;
  } else if (selected && active)
    view = html`<p class="dim">
      Download this file to open it. Executable files are kept separate from this task page.
    </p>`;
  return html`<section class="tp-artifact">
    <div class="tp-artifact-head">
      <span
        >${a.name}<small
          >${live ? "Live link · mutable" : "Saved file"}${a.size != null ? " · " + sizeLabel(a.size) : ""}</small
        ></span
      >${href ? html`<a class="btn" href="${live ? href : href + (href.includes("?") ? "&" : "?") + "download=1"}" target="_blank" rel="noopener noreferrer" ${live ? "" : raw(` download`)}>${live ? "Open link" : "Download"}</a>` : ""}
    </div>
    ${view}
  </section>`;
}
export function resultView(result: TaskResult | undefined, artifactId?: string): Safe {
  if (!result)
    return html`<div class="tp-result-empty">
      <h3>Your result will appear here</h3>
      <p>Answer any questions in the conversation. You will confirm a short proposal before production starts.</p>
    </div>`;
  const artifacts = result.artifacts ?? [],
    selected = artifacts.find((a) => a.id === artifactId) ?? artifacts[0];
  return html`<header class="tp-result-heading">
      <h2>${result.title || "Result"}</h2>
      <p>${result.summary || ""}</p>
      ${result.createdAt ? html`<small class="dim">Saved ${new Date(result.createdAt).toLocaleString()}${(result.storedSize ?? result.size) != null ? " · " + sizeLabel(result.storedSize ?? result.size) + " preserved" : ""}</small>` : ""}
    </header>
    ${artifacts.length > 1 ? html`<div class="tp-output-tabs" role="group" aria-label="Outputs">${artifacts.map((a) => html`<button class="tk-chip${a.id === selected?.id ? " on" : ""}" type="button" data-artifact="${a.id}" aria-pressed="${String(a.id === selected?.id)}">${a.name}</button>`)}</div>` : ""}${selected ? artifactView(selected, true) : html`<p class="tp-limit">No saved file was published for this result.</p>`}${result.liveUrl && !artifacts.some((a) => a.url === result.liveUrl) && webUrl(result.liveUrl) ? artifactView({ id: "live", name: "Live website", kind: "website", url: result.liveUrl }, true) : ""}
    <section class="tp-checks">
      <h3>Checks and limits</h3>
      ${
        result.checks?.length
          ? html`<ul>
              ${result.checks.map((c) => html`<li>${typeof c === "string" ? c : [c.label, c.outcome, c.evidence].filter(Boolean).join(" — ")}</li>`)}
            </ul>`
          : html`<p>No verification evidence has been published.</p>`
      }${
        result.limitations?.length
          ? html`<ul>
              ${result.limitations.map((l) => html`<li>${l}</li>`)}
            </ul>`
          : ""
      }
      <p class="dim">Accepting a result does not publish it. A preview alone does not prove that a backend works.</p>
    </section>`;
}
export async function loadTextArtifacts(box: HTMLElement) {
  await Promise.all(
    [...box.querySelectorAll<HTMLElement>("[data-text-artifact]")].map(async (el) => {
      try {
        const r = await fetch(el.dataset.textArtifact!);
        if (!r.ok) throw new Error();
        const value = await r.text();
        if (el.isConnected)
          el.textContent =
            value.length > 1_000_000
              ? value.slice(0, 1_000_000) + "\nPreview shortened. Download for the whole file."
              : value;
      } catch {
        if (el.isConnected) el.textContent = "The saved file could not be read. Try Download or refresh the task.";
      }
    }),
  );
}

// The workspace already checks frame headers and exposes local development ports
// for remote devices. Task previews use those same services, with an opaque sandbox.
export async function loadLiveArtifacts(box: HTMLElement) {
  await Promise.all(
    [...box.querySelectorAll<HTMLIFrameElement>("iframe[data-live-url]")].map(async (frame) => {
      if (frame.dataset.checked) return;
      frame.dataset.checked = "1";
      const original = webUrl(frame.dataset.liveUrl),
        section = frame.closest(".tp-artifact")!;
      const note = section.querySelector<HTMLElement>("[data-live-status]")!,
        link = section.querySelector<HTMLAnchorElement>("a")!;
      if (!original) {
        frame.hidden = true;
        note.textContent = "The preview address is unavailable.";
        return;
      }
      let url = original;
      try {
        const response = await fetch("/frameable?url=" + encodeURIComponent(original));
        const check = await response.json();
        if (!frame.isConnected) return;
        if (check.frameable === false) {
          frame.hidden = true;
          note.textContent = "This site refuses to appear inside kaizen. Use Open link to view it in another tab.";
          return;
        }
      } catch {
        note.textContent = "Preview availability could not be checked. Use Open link if it does not appear.";
      }
      const local = /^(localhost|127\.0\.0\.1|\[::1\])$/;
      if (local.test(new URL(original).hostname) && !local.test(location.hostname)) {
        frame.hidden = true;
        note.textContent = "Opening this computer’s preview for this device…";
        try {
          const response = await fetch("/expose", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: original }),
          });
          const exposed = await response.json();
          if (!frame.isConnected) return;
          const available = exposed.ok && webUrl(exposed.url);
          if (!available) {
            note.textContent =
              "This preview is on the computer running kaizen and could not be opened for this device. Open the task on that computer.";
            link.textContent = "Open on computer";
            return;
          }
          url = available;
          link.href = url;
          note.textContent = exposed.hint || "Live preview. This address can change during later work.";
        } catch {
          note.textContent =
            "The preview could not be opened for this device. Open the task on the computer running kaizen.";
          link.textContent = "Open on computer";
          return;
        }
      }
      if (!frame.isConnected) return;
      frame.hidden = false;
      frame.src = url;
      frame.addEventListener(
        "load",
        () => {
          if (note.textContent?.startsWith("Checking"))
            note.textContent =
              "Live preview. If it does not appear, use Open link. Some apps require their own browser tab.";
        },
        { once: true },
      );
      frame.addEventListener(
        "error",
        () => {
          frame.hidden = true;
          note.textContent = "The live preview could not be opened. Use Open link or ask for a saved screenshot.";
        },
        { once: true },
      );
    }),
  );
}
