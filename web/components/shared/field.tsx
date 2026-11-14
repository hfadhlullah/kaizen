import { useId, type ReactNode } from "react";
import { cn } from "../../lib/core/index.ts";
import { Label } from "@web/ui";

type ControlProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean };
// Label above, the control, then help in the dim colour, then an error in the danger colour. The control is
// given its id and the aria links to help and error; every input in a page goes through Field. the second argument, the label's id, names a
// control that is a group (segments, a stepper) through aria-labelledby.
export function Field({
  id: idProp,
  label,
  help,
  error,
  inline,
  row,
  dim,
  children,
}: {
  id?: string; // a fixed id for the control (a setting's own), in place of a generated one
  label: ReactNode;
  help?: ReactNode;
  error?: string;
  inline?: boolean; // the label beside the control, small, for a row of compact fields
  row?: boolean; // a settings row: label and help on the left, the control on the right (stacked when narrow)
  dim?: boolean; // the row has no effect right now: dimmed, still editable
  children: (props: ControlProps, labelId: string) => ReactNode;
}) {
  const auto = useId(),
    id = idProp ?? auto,
    helpId = `${id}-help`,
    errId = `${id}-err`,
    described = [help && helpId, error && errId].filter(Boolean).join(" ") || undefined;
  const control = children({ id, "aria-describedby": described, "aria-invalid": error ? true : undefined }, `${id}-l`);
  const helpEl = help && (
    <p id={helpId} className={cn("text-sm text-muted-foreground", row && "col-start-1 text-xs leading-normal")}>
      {help}
    </p>
  );
  const errEl = error && (
    <p id={errId} role="alert" className="text-sm text-danger">
      {error}
    </p>
  );
  if (row)
    return (
      <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-0.5 px-3.5 py-2.5 @max-[520px]:grid-cols-1">
        <Label
          id={`${id}-l`}
          htmlFor={id}
          className={cn("self-center text-sm font-normal text-strong", dim && "opacity-50")}
        >
          {label}
        </Label>
        <div
          className={cn(
            "col-start-2 self-center justify-self-end @max-[520px]:col-start-1 @max-[520px]:row-auto @max-[520px]:mt-1.5 @max-[520px]:max-w-full @max-[520px]:justify-self-start",
            (help || error) && "row-span-2",
            dim && "opacity-50",
          )}
        >
          {control}
        </div>
        {helpEl}
        {errEl}
      </div>
    );
  return (
    <div className={inline ? "flex min-w-0 items-center gap-1.5" : "flex flex-col gap-1.5"}>
      <Label id={`${id}-l`} htmlFor={id} className={inline ? "shrink-0 text-xs text-muted-foreground" : undefined}>
        {label}
      </Label>
      {control}
      {helpEl}
      {errEl}
    </div>
  );
}
