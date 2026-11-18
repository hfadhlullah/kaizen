import { useEffect, useState } from "react";
import { isPhone } from "./utils.ts";

// True on a phone-width window, and follows the window as it is resized or turned.
export function usePhone() {
  const [phone, setPhone] = useState(isPhone);
  useEffect(() => {
    const q = matchMedia("(max-width:640px)"),
      on = () => setPhone(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return phone;
}
