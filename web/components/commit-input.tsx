import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "../ui/input.tsx";

// A text field that saves when you leave it or press Enter with something changed (a native `change`), not on every
// key. It follows `value` when the server's answer differs, and hands back the text trimmed unless `raw`. Enter and the
// blur that follows send once; when the save is over (`onCommit` may return its promise) the field shows what the
// server kept, so a refused text does not stay typed in.
export function CommitInput({
  value,
  onCommit,
  raw,
  ...props
}: { value: string; onCommit: (v: string) => unknown; raw?: boolean } & Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange"
>) {
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(0),
    sent = useRef<string | null>(null);
  useEffect(() => setText(value), [value, saved]);
  const commit = () => {
    const v = raw ? text : text.trim();
    if (v === value || v === sent.current) return;
    sent.current = v;
    void Promise.resolve(onCommit(v)).finally(() => {
      sent.current = null;
      setSaved((n) => n + 1);
    });
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
