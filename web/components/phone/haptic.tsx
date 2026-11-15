import { useEffect, useRef } from "react";
import { isPhone } from "@lib/core";

// A light tick on every tap of something pressable on a phone. Android has vibrate; iOS (18+) has none, but Safari
// ticks when a switch checkbox toggles, so a hidden one is toggled through its label. `kz-haptic` = off turns it off.
const PRESSABLE = "button,a,summary,label,select,[role=button],input[type=checkbox]";
export function Haptic() {
  const tick = useRef<HTMLLabelElement>(null);
  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (!isPhone() || !e.isTrusted || !(e.target as Element).closest?.(PRESSABLE)) return;
      try {
        if (localStorage.getItem("kz-haptic") === "off") return;
      } catch {
        /* no setting: tick */
      }
      if (navigator.vibrate) return void navigator.vibrate(8);
      tick.current?.click();
    };
    addEventListener("click", on, true);
    return () => removeEventListener("click", on, true);
  }, []);
  return (
    // This click is not the user's: a window listener would read it as a tap outside a sheet.
    <label ref={tick} hidden onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" {...{ switch: "" }} />
    </label>
  );
}
