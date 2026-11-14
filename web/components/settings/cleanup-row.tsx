import { cleanup, useSettings } from "../../lib/settings/index.ts";
import { Button } from "@web/ui";
import { Field } from "../shared/index.ts";

// Settings → General → Storage: the two halves of `kaizen prune`, one button each, so clearing dead launch records
// never takes run history with it.
export function CleanupRow({ which }: { which: "records" | "runs" }) {
  const d = useSettings((s) => s.data?.cleanup);
  if (!d) return null;
  const total = d.records.abandoned + d.records.unowned + d.records.gone;
  const records = which === "records",
    n = records ? total : d.runs,
    id = records ? "s-clean-records" : "s-clean-runs";
  return (
    <Field
      row
      id={id}
      label={records ? "Clean launch records" : "Delete old runs"}
      help={
        records
          ? `${total} older than a week: ${d.records.abandoned} abandoned · ${d.records.unowned} unowned · ${d.records.gone} run gone`
          : `${d.runs} finished runs beyond the newest ${d.keep}${d.rescued ? `; ${d.rescued} open backlog items move to backlog.md` : ""}`
      }
    >
      {() => (
        <Button id={id} disabled={!n} onClick={() => void cleanup(which)}>
          {records ? "Clean up" : "Delete"}
        </Button>
      )}
    </Field>
  );
}
