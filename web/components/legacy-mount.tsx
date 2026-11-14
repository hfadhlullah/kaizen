import { useEffect, useRef } from "react";

// A card that is still old code (the phone and WhatsApp setup): an empty element React leaves alone, handed to `mount`
// once. Rebuilt in the phase that rewrites phone setup.
export function LegacyMount({ id, mount }: { id: string; mount: (el: HTMLElement) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) mount(ref.current);
  }, [mount]);
  return (
    <div className="px-3.5 py-2.5">
      <div id={id} ref={ref} className="kz-keep" />
    </div>
  );
}
