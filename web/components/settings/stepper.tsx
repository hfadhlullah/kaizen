import { useEffect, useRef, useState } from "react";
import { cn } from "@lib/core";

// A choice from a long list: ‹ value ›, stepping and wrapping like a game's options screen. It keeps its own position,
// so each click moves one value even before a save is read back; `onChange` hears the value at once, or `delay` ms
// after the last click when saving once per burst is wanted. Left and Right press the arrows, and focus moves to the
// arrow pressed. The group takes its name from `labelledBy`.
export function Stepper({
  id,
  values,
  value,
  onChange,
  delay = 0,
  labelledBy,
}: {
  id: string;
  values: string[];
  value: string;
  onChange: (v: string) => void;
  delay?: number;
  labelledBy: string;
}) {
  const [i, setI] = useState(() => Math.max(values.indexOf(value), 0)),
    timer = useRef<ReturnType<typeof setTimeout>>(undefined),
    prev = useRef<HTMLButtonElement>(null),
    next = useRef<HTMLButtonElement>(null);
  // What the server kept replaces the position (but not while a burst of clicks is still settling).
  useEffect(() => {
    if (!timer.current) setI(Math.max(values.indexOf(value), 0));
  }, [value, values]);
  const step = (d: number) => {
    const n = (i + d + values.length) % values.length;
    setI(n);
    clearTimeout(timer.current);
    if (!delay) return onChange(values[n]!);
    timer.current = setTimeout(() => ((timer.current = undefined), onChange(values[n]!)), delay);
  };
  const arrow = "size-7 rounded-sm text-[16px] text-muted-foreground hover:bg-card hover:text-foreground";
  return (
    <span
      id={id}
      role="group"
      aria-labelledby={labelledBy}
      className="inline-flex items-center gap-0.5 rounded-sm border border-border p-0.5"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const b = (e.key === "ArrowLeft" ? prev : next).current;
        b?.focus();
        b?.click();
      }}
    >
      <button
        ref={prev}
        id={`${id}-prev`}
        type="button"
        aria-label="Previous"
        className={arrow}
        onClick={() => step(-1)}
      >
        ‹
      </button>
      <output
        aria-live="polite"
        className={cn("min-w-22 whitespace-nowrap px-1.5 text-center text-sm text-foreground")}
      >
        {values[i] === "" ? "—" : values[i]}
      </output>
      <button ref={next} id={`${id}-next`} type="button" aria-label="Next" className={arrow} onClick={() => step(1)}>
        ›
      </button>
    </span>
  );
}
