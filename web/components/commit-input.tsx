import { useEffect, useState, type ComponentProps } from "react";
import { Input } from "../ui/input.tsx";

// A text field that saves when you leave it or press Enter with something changed (a native `change`), not on every
// key. It follows `value` when the server's answer differs, and hands back the text trimmed unless `raw`.
export function CommitInput({
  value,
  onCommit,
  raw,
  ...props
}: { value: string; onCommit: (v: string) => void; raw?: boolean } & Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange"
>) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const v = raw ? text : text.trim();
    if (v !== value) onCommit(v);
  };
  return (
    <Input
      {...props}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}
