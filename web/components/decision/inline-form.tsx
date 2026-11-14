import { useState } from "react";
import { Button, Input } from "@web/ui";
import { Field } from "../shared/index.ts";

// One labelled text field with its submit button beside it ("New project name" + Create project).
export function InlineForm({
  label,
  placeholder,
  submitLabel,
  onSubmit,
  disabled,
}: {
  label: string;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="mt-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <Field label={label}>
        {(p) => (
          <div className="flex flex-wrap gap-2 max-sm:[&>input]:basis-full">
            <Input
              {...p}
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={disabled}>
              {submitLabel}
            </Button>
          </div>
        )}
      </Field>
    </form>
  );
}
