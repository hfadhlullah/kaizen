import { AGENT_FAVICONS } from "./agent-favicons.ts";
import { html } from "./dom.ts";

// Names worth suggesting, per tool, from the tool's own docs; typing any other name stays allowed.
// ponytail: claude only, add another tool's names when its own CLI help lists them.
const SUGGEST: Record<string, string[]> = { claude: ["haiku", "sonnet", "opus"] };

// The worker model row's label (the tool's icon and name) and its input with that tool's suggestions.
export const modelLabel = (r: { key: string; label: string }) =>
  html`<img class="ag-i" src="${AGENT_FAVICONS[r.key.split(".").pop()!] ?? ""}" alt="" width="16" height="16" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;border-radius:3px">${r.label.replace("Worker model: ", "")}`;
export const modelInput = (r: { key: string; value: string }, id: string) => {
  const tool = r.key.split(".").pop()!;
  return html`<span><input class="sel" id="${id}" value="${r.value}" placeholder="inherit" list="${id}-dl" spellcheck="false" autocomplete="off">${SUGGEST[tool] ? html`<datalist id="${id}-dl">${SUGGEST[tool]!.map((m) => html`<option value="${m}"></option>`)}</datalist>` : ""}</span>`;
};

// Settings → Orchestration: a picture of the flow, and warnings where they apply, above the three rows. The rows themselves are the generic ones.
const note = (text: unknown, q: string) => html`<div class="srow" data-q="orchestration workers ${q}"><p class="hint">${text}</p></div>`;

// The plan reaches the conductor, which hands out tasks; workers bring work back; it goes on to review. Joined by beams of light. currentColor and var(--accent), so it follows light and
// dark. CSS only; with reduced motion the lines simply stay lit.
const flow = html`<div class="orch-flow" data-q="orchestration workers flow plan merge review"><svg viewBox="0 0 910 250" width="100%" role="img" aria-label="A conductor takes the approved plan and hands tasks to workers. Each worker brings its work back to the conductor, which merges it and sends it to review.">
  <style>.orch-flow svg{display:block;overflow:visible;width:100%!important;height:auto!important;max-width:none!important;fill:none}.orch-l{fill:none;stroke:currentColor;stroke-width:2;opacity:.16}.orch-b{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;filter:drop-shadow(0 0 5px var(--accent))}.orch-flow rect{fill:var(--bg);stroke:currentColor;stroke-width:1.5}.orch-i path,.orch-i circle{fill:none;stroke:var(--accent);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.orch-flow text{fill:currentColor;stroke:none;font:600 15px var(--mono,ui-monospace,monospace)}@keyframes orch-beam{from{stroke-dashoffset:125}to{stroke-dashoffset:-25}}@media (prefers-reduced-motion:no-preference){.orch-b{stroke-dasharray:25 100;stroke-dashoffset:125;animation:orch-beam 4s linear infinite}}</style>
  <path class="orch-l" d="M150 125H200"/><path class="orch-l" d="M265 96V50Q265 32 283 32H500"/><path class="orch-l" d="M265 154V200Q265 218 283 218H500"/><path class="orch-l" d="M500 60H335Q317 60 317 78V96"/><path class="orch-l" d="M500 190H335Q317 190 317 172V154"/><path class="orch-l" d="M382 125H740"/>
  <path class="orch-b" pathLength="100" style="animation-delay:0s" d="M150 125H200"/><path class="orch-b" pathLength="100" style="animation-delay:0.5s" d="M265 96V50Q265 32 283 32H500"/><path class="orch-b" pathLength="100" style="animation-delay:0.5s" d="M265 154V200Q265 218 283 218H500"/><path class="orch-b" pathLength="100" style="animation-delay:1.7s" d="M500 60H335Q317 60 317 78V96"/><path class="orch-b" pathLength="100" style="animation-delay:1.7s" d="M500 190H335Q317 190 317 172V154"/><path class="orch-b" pathLength="100" style="animation-delay:2.8s" d="M382 125H740"/>
  <g transform="translate(20 96)"><rect width="130" height="58" rx="12"/><g transform="translate(18 21) scale(1.15)" class="orch-i"><path d="M1 1h7l4 4v9H1zM8 1v4h4"/></g><text x="44" y="35">plan</text></g><g transform="translate(200 96)"><rect width="182" height="58" rx="12"/><g transform="translate(18 21) scale(1.15)" class="orch-i"><circle cx="6.5" cy="6.5" r="2.5"/><path d="M6.5 0v3M6.5 10v3M0 6.5h3M10 6.5h3"/></g><text x="44" y="35">conductor</text></g><g transform="translate(500 18)"><rect width="160" height="58" rx="12"/><g transform="translate(18 21) scale(1.15)" class="orch-i"><path d="M1 2l4 3-4 3M7 10h5"/></g><text x="44" y="35">worker 1</text></g><g transform="translate(500 174)"><rect width="160" height="58" rx="12"/><g transform="translate(18 21) scale(1.15)" class="orch-i"><path d="M1 2l4 3-4 3M7 10h5"/></g><text x="44" y="35">worker 2</text></g><g transform="translate(740 96)"><rect width="150" height="58" rx="12"/><g transform="translate(18 21) scale(1.15)" class="orch-i"><circle cx="6.5" cy="6.5" r="6"/><path d="M4 6.5l2 2 3.5-4"/></g><text x="44" y="35">review</text></g>
</svg></div>`;

export const orchestrationRows = (d: { windows: boolean; bypass: boolean }) =>
  html`${flow}<div class="sgrp">
    ${d.windows ? note("Not available on Windows: workers run in real terminals on Linux and macOS. Orchestration reads as off here.", "windows") : ""}
    ${d.bypass ? note("Warning: bypass skips every prompt in every worker. Each worker tab and the run's card say so.", "bypass permissions") : ""}
  </div>`;
