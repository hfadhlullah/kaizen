import { age } from "@lib/core";
import { chipGroups, DOT, lineOf, openTerm, toggleAgents, WORD, type ARow, type Agent, type Status } from "@lib/rail";

// The side menu's rows keep the board's own classes (.wag, .chips, .arow ... in the legacy layer: the Home window's row and
// the collapsed menu share them), so the marks are plain sprite svgs and `i.si` dots, not the kit's Icon.
const SPRITE = ["claude", "codex", "gemini"];
const Mark = ({ a }: { a: Agent }) => (
  <svg aria-hidden="true">
    <use href={`#i-${SPRITE.includes(a.agent ?? "") ? a.agent : "ai"}`} />
  </svg>
);
const Dot = ({ st }: { st: Status }) => <i className={`si ${DOT[st]}`} />;
const ago = (t: number | undefined, now: number) => (!t ? "" : now - t < 60e3 ? "now" : age(t, now));

// Line 3 of a workspace row: one agent is one button; several are grouped chips by status, or a list when expanded.
// The agent's own output line is text in React, so it cannot inject markup.
export function AgentChips({
  rows,
  now,
  open,
  dir,
  ws,
}: {
  rows: ARow[];
  now: number;
  open: boolean;
  dir: string;
  ws: string;
}) {
  if (!rows.length) return null;
  const go = (e: { preventDefault(): void }, key: string) => (e.preventDefault(), openTerm(dir, ws, key));
  if (rows.length === 1) {
    const r = rows[0]!;
    return (
      <div className="wag">
        <button type="button" className="aone" title={`${r.a.name}: open its terminal`} onClick={(e) => go(e, r.a.key)}>
          <Dot st={r.st} />
          <Mark a={r.a} />
          <span className="atx">
            {WORD[r.st]} - {r.a.name}
          </span>
          <small>{ago(r.a.at, now)}</small>
        </button>
      </div>
    );
  }
  const chev = (
    <button
      type="button"
      className={`wchev${open ? " on" : ""}`}
      aria-expanded={open}
      aria-label={`${rows.length} agents: ${open ? "hide" : "show"} the list`}
      onClick={(e) => (e.preventDefault(), toggleAgents(dir, ws))}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 9l6 6 6-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
  if (open)
    return (
      <>
        <div className="wag">
          <span className="aht">{rows.length} agents</span>
          {chev}
        </div>
        <div className="alist">
          {rows.map((r) => (
            <button key={r.a.key} type="button" className="arow" title={lineOf(r)} onClick={(e) => go(e, r.a.key)}>
              <Dot st={r.st} />
              <Mark a={r.a} />
              <span className="atx">{lineOf(r)}</span>
              <small>{ago(r.a.at, now)}</small>
            </button>
          ))}
        </div>
      </>
    );
  return (
    <div className="wag">
      <span className="chips">
        {chipGroups(rows).map((g) => (
          <span key={g.st} className="chip">
            <Dot st={g.st} />
            {g.rs.map((r) => (
              <button
                key={r.a.key}
                type="button"
                className="amark"
                title={`${r.a.name} - ${WORD[g.st]}: open its terminal`}
                aria-label={`${r.a.name} - ${WORD[g.st]}: open its terminal`}
                onClick={(e) => go(e, r.a.key)}
              >
                <Mark a={r.a} />
              </button>
            ))}
          </span>
        ))}
      </span>
      {chev}
    </div>
  );
}
