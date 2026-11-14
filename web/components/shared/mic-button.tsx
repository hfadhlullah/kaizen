import { useEffect, useId, useRef, type RefObject } from "react";
import { hasMic, listeningFor, stopDictation, toggleMic, useMic, IDLE, type Field } from "@lib/dictation";
import { cn } from "@lib/core";
import { IconButton } from "./icon-button.tsx";

type Box = HTMLTextAreaElement | HTMLInputElement;
// The level meter: five bars that follow `--lvl`, which the dictation engine sets on the wrapper while it listens.
const BARS = [0.5, 0.9, 1.3, 0.8, 0.45];
const Vu = () => (
  <span aria-hidden="true" className="inline-flex h-full items-center gap-0.5">
    {BARS.map((w, n) => (
      <i
        key={n}
        style={{ "--w": w } as object}
        className="w-0.5 rounded-[1px] bg-current transition-[height] duration-[80ms] h-[calc(3px+12px*min(1,var(--lvl,0)*var(--w)))]"
      />
    ))}
  </span>
);

// Dictation into a text field: the button, its model-loading percentage and the level meter while it listens. The
// listening itself is lib/dictation (a worker, the microphone, the model). Nothing is drawn when the browser has no
// microphone. The field must be uncontrolled: dictation types into it and sends an input event.
export function MicButton({
  field,
  also = [],
  className,
}: {
  field: RefObject<Box | null>;
  also?: RefObject<Box | null>[]; // more fields it can dictate into (the focused one)
  className?: string;
}) {
  const id = useId(),
    wrap = useRef<HTMLSpanElement>(null),
    target = useRef<Field | null>(null),
    st = useMic((s) => s.st[id] ?? IDLE);
  useEffect(() => {
    if (!hasMic()) return;
    const fields = [field, ...also].map((f) => f.current).filter((f): f is Box => !!f);
    target.current = fields[0] ?? null;
    const offs = fields.map((f) => {
      const on = () => (target.current = f);
      f.addEventListener("focus", on);
      return () => f.removeEventListener("focus", on);
    });
    return () => {
      offs.forEach((o) => o());
      // Only a session this button started: another field's (a terminal's Ctrl+Alt+D) keeps listening.
      if (listeningFor(id)) stopDictation(true);
    };
  }, []);
  if (!hasMic()) return null;
  return (
    <span ref={wrap} className={cn("inline-flex", className)}>
      <IconButton
        icon={
          st.on ? (
            <Vu />
          ) : st.loading && st.pct != null ? (
            <i className="text-[10px] not-italic tabular-nums">{st.pct}%</i>
          ) : (
            "mic"
          )
        }
        label="Dictate"
        className={cn("size-[26px] [&_svg]:size-[15px]", (st.on || st.busy) && "text-primary")}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (target.current) void toggleMic({ id, el: wrap.current, target: () => target.current! });
        }}
      />
    </span>
  );
}
