import { useEffect, useRef, useState } from "react";
import {
  appName,
  available,
  behindMsg,
  getVer,
  gotVer,
  later,
  upToDate,
  upgrade,
  useUpdate,
  type Version,
} from "../lib/settings/index.ts";
import { Button } from "../ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";

// The Update button, shared by the About bar and the card: asks first, then shows what is happening.
function UpdateButton({ v, label }: { v: Version; label: string }) {
  const [say, setSay] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="primary"
      id="upd-go"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await upgrade(v);
        if (r === "no") setSay("");
        else setSay(r === "opened" ? "Opened the download page" : "Restarting…");
        setBusy(r === "restarting");
      }}
    >
      {say || label}
    </Button>
  );
}

// What's new: each newer release's one-line title, in a popover.
function News({ v }: { v: Version }) {
  if (!v.notes?.length) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>What's new</Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(360px,calc(100vw-32px))] px-3.5 py-2.5 leading-normal">
        <ul className="mb-2 list-disc pl-[18px]">
          {v.notes.map((n) => (
            <li key={n.v} className="my-0.5">
              <b>{n.v}</b> {n.text}
            </li>
          ))}
        </ul>
        <a
          className="text-primary"
          href="https://github.com/hfadhlullah/kaizen/releases"
          target="_blank"
          rel="noopener"
        >
          All release notes
        </a>
      </PopoverContent>
    </Popover>
  );
}

// Settings → General opens on About: the version and the update check. With no newer release it is a quiet row whose
// Check for updates asks npm now instead of the server's 6 h cache.
export function UpdateBar() {
  const ver = useUpdate((s) => s.ver);
  const [msg, setMsg] = useState(""),
    [label, setLabel] = useState(""),
    [checking, setChecking] = useState(false);
  const upd = available(ver) ? ver : null;
  const name = appName();
  const go = useRef<HTMLDivElement>(null);
  const check = async () => {
    setChecking(true);
    const v = await getVer(true).catch(() => null);
    setChecking(false);
    if (!v || !v.latest) {
      if (upd) setLabel("Could not check. Try again");
      else
        setMsg(
          `Could not reach ${(globalThis as { kaizenDesktop?: unknown }).kaizenDesktop ? "GitHub Releases" : "npm"}. Try again later.`,
        );
      return;
    }
    setLabel("");
    gotVer(v);
    setMsg(v.update ? "" : upToDate(v));
    if (v.update) queueMicrotask(() => go.current?.querySelector<HTMLElement>("#upd-go")?.focus());
  };
  const shown = msg || (ver ? (ver.behind ? behindMsg(ver) : `${name} ${ver.version}`) : name);
  const checkBtn = (
    <Button id="upd-chk" disabled={checking} onClick={check}>
      {checking ? "Checking…" : label || "Check for updates"}
    </Button>
  );
  return (
    <div className="mb-6">
      <div className="mb-2 text-sm font-semibold text-strong">About</div>
      <div
        className={
          upd
            ? "relative flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg-2))] px-3.5 py-2.5 text-base"
            : "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 text-base text-strong"
        }
      >
        {ver?.failed && (
          <span role="alert" className="basis-full text-warning">
            Last update failed: {ver.failed}
          </span>
        )}
        {upd ? (
          <>
            <span>
              {name} <b>{upd.latest}</b> is available. You are running {upd.version}.
            </span>
            <span ref={go} className="flex items-center gap-2">
              <News v={upd} />
              {checkBtn}
              <UpdateButton v={upd} label={`Update ${name}`} />
            </span>
          </>
        ) : (
          <>
            <span id="upd-msg" aria-live="polite">
              {shown}
            </span>
            {checkBtn}
          </>
        )}
      </div>
    </div>
  );
}

// The bottom-right card for a new release. Later silences that version in this browser; the next release asks again.
export function UpdateCard() {
  const ver = useUpdate((s) => s.ver),
    quiet = useUpdate((s) => s.later);
  const [gone, setGone] = useState(false);
  useEffect(() => setGone(false), [ver?.latest]);
  if (!available(ver) || quiet === ver.latest || gone) return null;
  return (
    <div
      role="status"
      className="fixed bottom-7 right-7 z-40 flex w-80 max-w-[calc(100%-32px)] flex-col gap-3 rounded-md border border-primary bg-card px-4 py-3.5 text-base text-foreground shadow-md max-[640px]:bottom-[calc(68px+env(safe-area-inset-bottom))] max-[640px]:right-4"
    >
      <span>
        {appName()} <b>{ver.latest}</b> is available. You are running {ver.version}.
      </span>
      <span className="flex items-center justify-end gap-2">
        <Button
          onClick={() => {
            later(ver.latest!);
            setGone(true);
          }}
        >
          Later
        </Button>
        <UpdateButton v={ver} label="Update now" />
      </span>
    </div>
  );
}
