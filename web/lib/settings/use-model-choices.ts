import { useEffect, useState } from "react";

export type ModelChoice = { id: string; name: string };

// The models one agent tool offers, read by the board's server from the tool itself (`GET /models`). One request per
// tool per page: the rows of a tool share it. A failed read gives [] and the field stays a free text.
const asked = new Map<string, Promise<ModelChoice[]>>();
const ask = (tool: string) => {
  let p = asked.get(tool);
  if (!p) {
    p = fetch("/models?agent=" + encodeURIComponent(tool))
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((j) => (Array.isArray(j.models) ? (j.models as ModelChoice[]) : []))
      .catch(() => []);
    asked.set(tool, p);
  }
  return p;
};

export function useModelChoices(tool: string, on: boolean): ModelChoice[] {
  const [rows, setRows] = useState<ModelChoice[]>([]);
  useEffect(() => {
    if (!on) return;
    let live = true;
    void ask(tool).then((r) => live && setRows(r));
    return () => {
      live = false;
    };
  }, [tool, on]);
  return rows;
}
