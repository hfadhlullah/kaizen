import { html, raw } from "./dom.ts";

// A launch choice, separate from the user's saved default permission policy.
export function chooseAgentPermissions(agent: { name: string; cmd: string; yolo?: boolean; bypassDefault?: boolean }): Promise<boolean | null> {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "pagsheet agent-create";
    d.innerHTML = String(html`<h4>New ${agent.name}</h4>${agent.yolo ? html`<label class="agent-yolo"><span>Yolo / bypass permissions<small>Run commands without permission prompts</small></span><input type="checkbox" role="switch" aria-label="Yolo / bypass permissions"${raw(agent.bypassDefault ? " checked" : "")}></label>` : html`<p>This agent uses its own permission settings.</p>`}<button type="button" data-create>Create agent</button><button type="button" data-cancel>Cancel</button>`);
    let result: boolean | null = null;
    d.querySelector("[data-create]")!.addEventListener("click", () => {
      result = !!agent.yolo && !!d.querySelector<HTMLInputElement>("input")?.checked;
      d.close();
    });
    d.querySelector("[data-cancel]")!.addEventListener("click", () => d.close());
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
    d.addEventListener("close", () => { d.remove(); resolve(result); }, { once: true });
    document.body.append(d);
    d.showModal();
  });
}
