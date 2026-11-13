import { useEffect, useRef, type RefObject } from "react";
import { host } from "../lib/host.ts";

// Dictation into a text field. The button and the listening itself are the board's dictation module (a worker, the
// microphone, the model): this only places its button and stops it with the page. Nothing is drawn when the browser
// has no microphone. The field must be uncontrolled: dictation types into it and sends an input event.
export function MicButton({ field, className }: { field: RefObject<HTMLTextAreaElement | null>; className?: string }) {
  const slot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const b = field.current && host.mic(field.current);
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
