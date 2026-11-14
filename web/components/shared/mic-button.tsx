import { useEffect, useRef, type RefObject } from "react";
import { host } from "../../lib/core/index.ts";

// Dictation into a text field. The button and the listening itself are the board's dictation module (a worker, the
// microphone, the model): this only places its button and stops it with the page. Nothing is drawn when the browser
// has no microphone. The field must be uncontrolled: dictation types into it and sends an input event.
export function MicButton({
  field,
  also = [],
  className,
}: {
  field: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  also?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>[]; // more fields it can dictate into (the focused one)
  className?: string;
}) {
  const slot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const fields = [field, ...also].map((f) => f.current).filter((f) => !!f) as (
        HTMLTextAreaElement | HTMLInputElement
      )[],
      b = fields.length && host.mic(fields);
    if (!b || !slot.current) return;
    slot.current.append(b);
    return () => {
      b.remove();
      host.stopDictation();
    };
  }, []);
  // kz-keep: the board's own button styles (.ib) stay as they are inside a React page.
  return <span ref={slot} className={`kz-keep inline-flex ${className ?? ""}`} />;
}
