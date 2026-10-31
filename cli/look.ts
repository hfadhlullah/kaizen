// How the installer and `kaizen setup` look: the current monochrome brand. Emphasis is
// bold, not a colour, so it follows the terminal's own theme, light or dark, as the
// board's default palette does (design.md, section 2). Green stays for success.
export const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  accent: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
};

// The pixel K of site/media/favicon.svg, drawn in half blocks so its squares stay square.
const K = ["█ ▄▀", "██  ", "█ ▀▄"];

// Compact block wordmark (27 columns x 3 rows).
export const WORDMARK = [
  "█ █  ▄▀█  █  ▀▀█  █▀▀  █▄ █",
  "█▀▄  █▀█  █   ▄▀  ██▄  █ ▀█",
  "█ █  █ █  █  █▄▄  █▄▄  █  █",
];

export function banner() {
  return `\n${K.map((row) => `  ${c.bold(row)}`).join("\n")}\n\n  ${c.bold("改善")}  ${c.dim("continuous improvement")}\n`;
}

export function nextSteps() {
  return `
  ${c.bold("You're ready")}
    1  Restart Claude Code ${c.dim("so it picks up the new commands")}
    2  Ask for something: ${c.accent("/kaizen <what you want done>")}

  ${c.dim("Change anything later:")} ${c.accent("kaizen setup")}${c.dim(".  Every command:")} ${c.accent("/kaizen-help")}
`;
}
