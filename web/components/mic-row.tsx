import { useEffect, useState } from "react";
import { listMics, saveMic, savedMic } from "../lib/mic.ts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";
import { Field } from "./field.tsx";

// Dictation's microphone, per browser. No choice means the system default (Radix needs a value, so "" is "default").
const DEFAULT = "default";
export function MicRow() {
  const [mics, setMics] = useState<{ id: string; label: string }[]>([]),
    [value, setValue] = useState(DEFAULT);
  useEffect(() => {
    void listMics().then((m) => {
      setMics(m);
      const saved = savedMic();
      setValue(m.some((d) => d.id === saved) ? saved : DEFAULT);
    });
  }, []);
  return (
    <Field
      row
      id="v-mic"
      label="Microphone"
      help="Used by this browser. Names appear after you first allow the microphone. Ctrl+Alt+D dictates into the focused terminal."
    >
      {({ id }, labelId) => (
        <Select
          value={value}
          onValueChange={(v) => {
            setValue(v);
            saveMic(v === DEFAULT ? "" : v);
          }}
        >
          <SelectTrigger id={id} aria-labelledby={labelId} className="w-60 @max-[520px]:w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT}>System default</SelectItem>
            {mics.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
