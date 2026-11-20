// One drawn mark per skill, by id, as shapes the Skills row draws into a 24x24 box; a skill without one gets the puzzle piece.
export type Shape = [tag: "path" | "circle" | "rect", attrs: Record<string, string | number>];
const p = (d: string): Shape => ["path", { d }];
const PUZZLE: Shape[] = [p("M10 4a2 2 0 1 1 4 0v2h5v5h-2a2 2 0 1 0 0 4h2v5H5v-5h2a2 2 0 1 0 0-4H5V6h5Z")];
const SKILL_ICONS: Record<string, Shape[]> = {
  kaizen: [p("M4 7h11M4 12h7M4 17h11"), p("m16 11 2 2 3-4")],
  "kaizen-help": [
    ["circle", { cx: 12, cy: 12, r: 9 }],
    p("M9.5 9.5a2.5 2.5 0 1 1 3.8 2.1c-.9.6-1.3 1.1-1.3 2.1"),
    p("M12 17h.01"),
  ],
  "kaizen-book": [p("M12 6c-2-1.5-5-2-8-2v15c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2Z"), p("M12 6v15")],
  "kaizen-deck": [["rect", { x: 3, y: 4, width: 18, height: 12, rx: 1 }], p("M12 16v4M8 20h8M8 12l3-3 2 2 3-3")],
  "kaizen-computer": [["rect", { x: 3, y: 4, width: 18, height: 12, rx: 1 }], p("M8 20h8M12 16v4M9 8l5 3-2 .8-.8 2Z")],
  "kaizen-game": [
    ["rect", { x: 2, y: 7, width: 20, height: 11, rx: 5 }],
    p("M7 10.5v4M5 12.5h4"),
    ["circle", { cx: 16, cy: 11.5, r: 0.6 }],
    ["circle", { cx: 18, cy: 13.5, r: 0.6 }],
  ],
  "kaizen-video": [["rect", { x: 3, y: 6, width: 13, height: 12, rx: 2 }], p("m16 10 5-3v10l-5-3")],
  "kaizen-concept": [["rect", { x: 3, y: 4, width: 18, height: 16, rx: 2 }], p("M3 9h18M9 9v11")],
  "kaizen-explore": [["circle", { cx: 12, cy: 12, r: 9 }], p("m15.5 8.5-2 5-5 2 2-5Z")],
  "lemo-opuscar": [["rect", { x: 3, y: 4, width: 18, height: 16, rx: 2 }], p("M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4")],
  "disk-cleanup": [["rect", { x: 3, y: 13, width: 18, height: 7, rx: 2 }], p("m5 13 2-8h10l2 8M17 16.5h.01")],
  rea: [["circle", { cx: 10.5, cy: 10.5, r: 6 }], p("m15 15 6 6"), p("M8.5 9 7 10.5 8.5 12M12.5 9l1.5 1.5-1.5 1.5")],
};
export const skillShapes = (id: string) => SKILL_ICONS[id] ?? PUZZLE;
// A skill from outside kaizen has no drawn mark: it shows its first letter in a square instead of the puzzle piece.
export const hasSkillIcon = (id: string) => id in SKILL_ICONS;
export const letterOf = (id: string) => (/[a-z0-9]/i.exec(id)?.[0] ?? "?").toUpperCase();
