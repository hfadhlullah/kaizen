// `kaizen computer`: desktop control through the Linux accessibility tree, for the
// kaizen-computer skill. It refuses every verb until that skill is turned on, passes
// arguments to cli/computer-helper.py without a shell, and prints one JSON result per
// call; each error carries a `recovery` step.
import { join } from "node:path";
import { skillsOn } from "./skills.ts";

export const SKILL = "kaizen-computer";
const HELPER = join(import.meta.dir, "computer-helper.py");
const MAX_OUT = 200_000, TIMEOUT = 15_000;
const VERBS: Record<string, [number, number]> = { apps: [0, 0], windows: [1, 1], state: [1, 2], click: [2, 2], "set-value": [3, 3], type: [3, 3] };
const USAGE = "apps | windows <app> | state <app> [window] | click <app> <id> | set-value <app> <id> <value> | type <app> <id> <text>";

const RECOVERY: Record<string, string> = {
  disabled: "Ask the user to turn on Desktop control in Settings → Skills. Do not try another way to reach the desktop.",
  unsupported: "Desktop control works on Linux only. Tell the user; do not retry.",
  "bad-usage": `Call it as: kaizen computer ${USAGE}.`,
  "no-python": "Install python3 with PyGObject and AT-SPI (Arch: python-gobject at-spi2-core; Debian: python3-gi gir1.2-atspi-2.0), then retry.",
  "no-atspi": "Install the AT-SPI Python bindings (Arch: python-gobject at-spi2-core; Debian: python3-gi gir1.2-atspi-2.0), then retry.",
  "no-a11y": "Accessibility is off or its bus is not running. Ask the user to enable it (GNOME: Settings → Accessibility; others: start at-spi-bus-launcher), then retry.",
  "app-not-found": "Run `kaizen computer apps` and use a name from that list. An app with accessibility off, or not started, is not listed; ask the user to open it.",
  "ambiguous-app": "Use a longer part of the app's name, or the exact name from `kaizen computer apps`.",
  "blocked-app": "Password managers are never read or operated. Stop and tell the user; do not look for another way in.",
  "window-not-found": "Run `kaizen computer windows <app>` and pass an index from it.",
  "stale-ref": "The window changed. Run `kaizen computer state <app>` again and use an id from the new result.",
  "secure-field": "Password fields are never read or filled. Ask the user to enter it themselves.",
  "no-action": "That node cannot be clicked. Run `state` and pick a node that lists `actions`, such as a button.",
  "not-editable": "That node takes no text. Pick a node whose states include `editable`, or a slider for a number.",
  "too-large": "Send less text, or split it into several calls.",
  timeout: "The app did not answer in time. Check it is not frozen, then retry once.",
  "helper-failed": "The helper broke on this call. Run `kaizen computer apps` to check the setup, then retry once; if it repeats, tell the user.",
};
const fail = (code: string, error: string) => ({ out: { ok: false, code, error, recovery: RECOVERY[code] ?? RECOVERY["helper-failed"] }, code: 1 });

export type Opts = { home: string; cmd?: string[] };

export async function computer(argv: string[], o: Opts): Promise<{ out: Record<string, unknown>; code: number }> {
  if (!skillsOn(o.home).includes(SKILL)) return fail("disabled", "Desktop control is turned off");
  const [verb = "", ...args] = argv, n = VERBS[verb];
  if (!n || args.length < n[0] || args.length > n[1]) return fail("bad-usage", `bad call: ${argv.join(" ")}`);
  if (!o.cmd && process.platform !== "linux") return fail("unsupported", "Linux only");
  const py = o.cmd ? null : Bun.which("python3");
  if (!o.cmd && !py) return fail("no-python", "python3 not found");
  // Argv only: the model's text reaches the helper as plain arguments, never a shell line.
  const p = Bun.spawn([...(o.cmd ?? [py!, "-I", HELPER]), verb, ...args], { stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: TIMEOUT });
  const text = await new Response(p.stdout).text();
  await p.exited;
  if (p.signalCode) return fail("timeout", "helper timed out");
  if (text.length > MAX_OUT) return fail("too-large", "result over the output limit");
  let r: any;
  try { r = JSON.parse(text); } catch { return fail("helper-failed", "helper returned no JSON"); }
  if (!r || typeof r !== "object") return fail("helper-failed", "helper returned no JSON");
  return r.ok === false ? fail(String(r.code ?? "helper-failed"), String(r.error ?? "failed")) : { out: r, code: 0 };
}

// What Settings shows on the row: what this machine lacks, from the helper's own check.
export function computerCheck(cmd?: string[]): { needs: { name: string; found: boolean }[]; note: string } {
  const wayland = process.env.XDG_SESSION_TYPE === "wayland";
  const note = (wayland ? "Wayland: keyboard shortcuts and screenshots are not available. Values, accessibility actions and typing into fields work where the app exposes them. " : "") + "Password managers are blocked by app name only: one in a browser or under another name is not.";
  const py = Bun.which("python3");
  if (!cmd && (process.platform !== "linux" || !py)) return { needs: [{ name: process.platform === "linux" ? "python3" : "Linux", found: false }], note };
  const r = Bun.spawnSync([...(cmd ?? [py!, "-I", HELPER]), "check"], { stdout: "pipe", stderr: "ignore", timeout: 5000 });
  let c: any = {};
  try { c = JSON.parse(r.stdout.toString()); } catch { /* an unreadable check counts as missing */ }
  return { needs: [{ name: "AT-SPI bindings", found: c.atspi === true }, { name: "accessibility on", found: c.a11y === true }], note };
}
