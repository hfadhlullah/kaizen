import { useCallback, useEffect, useRef, useState } from "react";
import { phoneCall, waCall, waPolling, type PhoneState, type WAStatus } from "./phone-setup.ts";

// The Tailscale card's state: loaded on mount, refreshed by Check again, and while a phone is connected every 10 s so
// its dot follows it joining the tailnet.
export function usePhoneSetup() {
  const [s, setS] = useState<PhoneState | null>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(""),
    live = useRef(true),
    cur = useRef<PhoneState | null>(null),
    working = useRef(false);
  const put = (n: PhoneState | null) => ((cur.current = n), setS(n));
  const load = useCallback(async () => {
    const r = await phoneCall();
    if (r.error) setErr(r.error);
    else put(r);
  }, []);
  useEffect(() => {
    live.current = true;
    void load();
    const t = setInterval(() => cur.current?.state === "connected" && !working.current && void load(), 10_000);
    return () => {
      live.current = false;
      clearInterval(t);
    };
  }, [load]);
  // Check again, Log in to Tailscale, Connect phone.
  const act = async (a: "check" | "login" | "connect") => {
    if (working.current) return;
    setErr("");
    if (a === "check") return load();
    working.current = true;
    setBusy(a);
    const r = await phoneCall({ do: a });
    working.current = false;
    setBusy("");
    if (r.error) return setErr(r.error);
    if (a !== "login") return put(r);
    if (r.url) window.open(r.url, "_blank", "noopener");
    // The sign-in happens in the browser: look again until Tailscale is running, for two minutes.
    for (let i = 0; i < 40 && live.current && cur.current?.state === "login"; i++) {
      await new Promise((ok) => setTimeout(ok, 3000));
      const n = await phoneCall();
      if (!n.error && live.current) put(n);
    }
  };
  return { s, err, busy, act };
}

// The WhatsApp card's state: polled every 2.5 s while a link is on its way.
export function useWhatsApp() {
  const [s, setS] = useState<WAStatus | null>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    cur = useRef({ s: null as WAStatus | null, busy: false });
  cur.current = { s, busy };
  const load = useCallback(async () => {
    const r = await waCall();
    if (r.error && !r.installed) setErr(r.error);
    else setS(r);
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(async () => {
      if (!waPolling(cur.current.s, cur.current.busy)) return;
      const r = await waCall();
      if (!r.error) setS(r);
    }, 2500);
    return () => clearInterval(t);
  }, [load]);
  const act = async (a: "check" | "connect" | "disconnect") => {
    if (cur.current.busy) return;
    setErr("");
    if (a === "check") return load();
    setBusy(true);
    if (a === "connect") {
      const r = await waCall({ op: "connect" });
      setBusy(false);
      if (r.error) setErr(r.error);
      else setS(r);
    } else {
      await waCall({ op: "disconnect" });
      setBusy(false);
      await load();
    }
  };
  return { s, err, busy, act };
}
