import { useId, useRef, useState } from "react";
import { Button, Checkbox, Dialog, DialogContent, DialogTitle, Input } from "@web/ui";
import { Field } from "../shared/index.ts";

// A new collection: its name and whether it is a client's (its items then count as Client). `onDone` gets the answer,
// or null when cancelled by Cancel, Escape or the backdrop.
export function CollectionDialog({
  where,
  onDone,
}: {
  where: string;
  onDone: (a: { name: string; client: boolean } | null) => void;
}) {
  const [name, setName] = useState(""),
    [client, setClient] = useState(false),
    field = useRef<HTMLInputElement>(null),
    box = useId();
  return (
    <Dialog open onOpenChange={(o) => !o && onDone(null)}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle className="sr-only">New collection</DialogTitle>
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return field.current?.focus();
            onDone({ name: name.trim(), client });
          }}
        >
          <Field label={`New collection${where ? ` in ${where}` : ""}: a client or a topic`}>
            {(p) => (
              <Input
                {...p}
                ref={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="e.g. Arupadatu, Pricing"
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>
          <div className="flex items-center gap-2 text-base text-muted-foreground">
            <Checkbox id={box} checked={client} onCheckedChange={(v) => setClient(v === true)} />
            <label htmlFor={box} className="cursor-pointer">
              A client — its items count as Client
            </label>
          </div>
          <div className="flex justify-end gap-1.5">
            <Button onClick={() => onDone(null)}>Cancel</Button>
            <Button variant="primary" type="submit">
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
