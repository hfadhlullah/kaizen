import { useEffect, useRef, type ReactNode } from "react";
import { LEVELS, type Annotator } from "@lib/annotate";
import { Checkbox, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@web/ui";

const row = "flex items-center justify-between gap-1.5 text-[12px] font-normal";
function Flag({ ann, k, label }: { ann: Annotator; k: "components" | "clear" | "block"; label: string }) {
  const on = ann.use((x) => x.settings[k]);
  return (
    <Label className={row}>
      <span className="flex items-center gap-1.5">
        <Checkbox checked={on} onCheckedChange={(v) => ann.setting(k, v === true)} />
        {label}
      </span>
    </Label>
  );
}

// The colour is taken when the picker closes (the input's own `change`), not on every step of a drag: each one would be
// saved and would repaint the framed page.
function Color({ ann, value }: { ann: Annotator; value: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current!,
      done = () => ann.setting("color", el.value);
    el.addEventListener("change", done);
    return () => el.removeEventListener("change", done);
  }, []);
  return <input ref={ref} type="color" defaultValue={value} key={value} />;
}

// Output detail, marker colour and behaviour, at the top of the notes list; each change is saved at once.
export function AnnotateSettings({ ann }: { ann: Annotator }): ReactNode {
  const s = ann.use((x) => x.settings);
  return (
    <div className="flex flex-col gap-1.5 rounded-sm border border-border p-2">
      <div className={row}>
        <Label className={row}>Output detail</Label>
        <Select value={s.level} onValueChange={(v) => ann.setting("level", v)}>
          <SelectTrigger size="sm" aria-label="Output detail">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Flag ann={ann} k="components" label="Component names" />
      <Label className={row}>
        Marker colour
        <Color ann={ann} value={s.color} />
      </Label>
      <Flag ann={ann} k="clear" label="Clear after copy or send" />
      <Flag ann={ann} k="block" label="Block page clicks while picking" />
    </div>
  );
}
