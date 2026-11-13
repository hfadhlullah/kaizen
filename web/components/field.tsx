import { useId, type ReactNode } from "react";
import { Label } from "../ui/label.tsx";

type ControlProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean };
// Label above, the control, then help in the dim colour, then an error in the danger colour. The control is
// given its id and the aria links to help and error; every input in a page goes through Field.
export function Field({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId(),
    helpId = `${id}-help`,
    errId = `${id}-err`,
    described = [help && helpId, error && errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-describedby": described, "aria-invalid": error ? true : undefined })}
      {help && (
        <p id={helpId} className="text-sm text-muted-foreground">
          {help}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
