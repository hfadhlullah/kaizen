import { useState, type ReactNode } from "react";
import {
  agentGroups,
  answerOffer,
  back,
  COPY,
  goto,
  missingPick,
  NAMES,
  next,
  NOTIF_TEXT,
  notifState,
  offerText,
  pickAgent,
  pickTheme,
  skip,
  toggleMore,
  useOnboarding,
  type Cfg,
} from "../lib/home/index.ts";
import { cn } from "../lib/core/index.ts";
import { Button } from "../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog.tsx";
import { Icon } from "../ui/icon.tsx";
import { PhoneCard } from "./phone-card.tsx";

const MOD = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform) ? "⌘" : "Ctrl";

// A choice card (radio): picked is a tinted card with a check.
function Card({
  on,
  onPick,
  children,
  className,
}: {
  on: boolean;
  onPick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      data-card
      onClick={onPick}
      className={cn(
        "relative flex min-h-12 items-center gap-2.5 rounded-md border border-border px-3 text-left text-base font-medium transition-colors hover:bg-muted",
        on &&
          "border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]",
        className,
      )}
    >
      {children}
      {on && (
        <i className="relative ml-auto grid size-4 flex-none place-items-center rounded-full bg-strong text-background">
          <Icon name="check" className="size-2.5" />
        </i>
      )}
    </button>
  );
}
const Panel = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-3 rounded-md border border-border p-3.5 text-base text-muted-foreground">
    {children}
  </div>
);

function AgentStep({ cfg, agent, more }: { cfg: Cfg; agent: string; more: boolean }) {
  const { detected, rest, all } = agentGroups(cfg);
  const miss = missingPick(cfg, agent);
  const [copied, setCopied] = useState("");
  const card = (a: { cmd: string; name: string }, off: boolean) => (
    <Card key={a.cmd} on={agent === a.cmd} onPick={() => pickAgent(a.cmd)}>
      <Icon name={a.cmd} sprite="c" />
      <span>
        {a.name}
        {off && <small className="block text-xs font-normal text-muted-foreground">Not found</small>}
      </span>
    </Card>
  );
  const help = miss && (
    <Panel>
      <p>
        <b>{miss.agent.name}</b> is not installed yet.
        {miss.how?.command ? " Run this in a terminal, then open kaizen again." : ""} You can carry on now: kaizen uses
        it as soon as it is on your PATH.
      </p>
      {miss.how?.command && (
        <div className="flex items-center gap-2.5 rounded-md border border-border bg-canvas px-2.5 py-2">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-foreground">
            {miss.how.command}
          </code>
          <Button
            onClick={() =>
              void navigator.clipboard?.writeText(miss.how!.command!).then(
                () => setCopied("Copied"),
                () => setCopied("Select and copy"),
              )
            }
          >
            {copied || "Copy"}
          </Button>
        </div>
      )}
      {miss.how && (
        <a className="self-start underline underline-offset-2" href={miss.how.docs} target="_blank" rel="noopener">
          Install instructions
        </a>
      )}
    </Panel>
  );
  const grid = "grid grid-cols-3 gap-2.5 max-[640px]:grid-cols-2";
  if (!detected.length)
    return (
      <>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          No agents found on your PATH. Pick the one you will use to see how to install it, or carry on.
        </p>
        <div role="radiogroup" aria-label="Default agent" className={grid}>
          {all.map((a) => card(a, true))}
        </div>
        {help}
      </>
    );
  return (
    <>
      <div className="text-sm text-muted-foreground">
        Detected on your system <span className="ml-1">{detected.length}</span>
      </div>
      <div role="radiogroup" aria-label="Default agent" className={grid}>
        {detected.map((a) => card(a, false))}
        {more && rest.map((a) => card(a, true))}
      </div>
      {!!rest.length && (
        <button
          type="button"
          className="self-start px-0.5 py-1.5 text-base text-muted-foreground hover:text-foreground"
          onClick={toggleMore}
        >
          {more ? "Hide agents" : `Show ${rest.length} more ${rest.length === 1 ? "agent" : "agents"} →`}
        </button>
      )}
      {help}
    </>
  );
}

// The look of a theme in its own colours, whatever the board shows now: these are what the theme is, not what the board uses.
const PV: Record<string, string> = {
  dark: "bg-[#121212]",
  light: "bg-[#f7f7f7]",
  system: "bg-[linear-gradient(90deg,#121212_50%,#f7f7f7_50%)]",
};
function LookStep({ theme }: { theme: string }) {
  const t = (k: string, name: string, hint: string, icon: string) => (
    <Card key={k} on={theme === k} onPick={() => pickTheme(k)} className="flex-col items-stretch gap-2.5 p-2.5">
      <span className={cn("flex h-[84px] overflow-hidden rounded-sm border border-border", PV[k])} aria-hidden>
        <i className="block w-[30%] bg-[rgb(128_140_170/0.22)]" />
        <i className="ml-2.5 mt-3.5 block h-[5px] w-[36%] self-start rounded-[3px] bg-[rgb(128_140_170/0.45)]" />
      </span>
      <span className="flex items-baseline justify-between gap-2">
        <b className="inline-flex items-center gap-1.5 font-medium">
          <svg
            viewBox="0 0 24 24"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={icon} />
          </svg>
          {name}
        </b>
        <small className="text-xs font-normal text-muted-foreground">{hint}</small>
      </span>
    </Card>
  );
  return (
    <>
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3 max-[640px]:grid-cols-2">
        {t("system", "System", "Match OS", "M3 5h18v11H3zM8 20h8M12 16v4")}
        {t("dark", "Dark", "Easy on the eyes", "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z")}
        {t(
          "light",
          "Light",
          "Bright & crisp",
          "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5",
        )}
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 flex-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4" />
        </svg>
        <span>
          Motion, density and more live in <b>Settings</b>.
        </span>
      </p>
    </>
  );
}

function AlertStep() {
  const [s, setS] = useState(notifState());
  return (
    <Panel>
      <p>{NOTIF_TEXT[s]}</p>
      <div className="flex flex-wrap gap-1.5">
        {s === "default" && (
          <Button
            variant="primary"
            onClick={() =>
              void Notification.requestPermission().then(
                () => setS(notifState()),
                () => setS(notifState()),
              )
            }
          >
            Allow notifications
          </Button>
        )}
        {s === "granted" && (
          <Button
            onClick={() =>
              new Notification("kaizen", {
                body: "This is how kaizen will tell you something needs you.",
                icon: "/logo.png",
              })
            }
          >
            Send test notification
          </Button>
        )}
      </div>
    </Panel>
  );
}

// The setup flow: four steps in one panel, a progress bar that jumps between them, then Add your first project.
// Escape and Skip ask first; clicking outside does nothing. Ctrl/Cmd+Enter always continues, a bare Enter does unless a
// button (other than a choice card) or a field holds focus.
function Flow({ cfg, flow }: { cfg: Cfg; flow: { step: number; agent: string; theme: string; more: boolean } }) {
  const { step } = flow,
    last = step === cfg.total - 1,
    s = COPY[step]!;
  return (
    <Dialog open>
      <DialogContent
        aria-label="Welcome to kaizen"
        aria-describedby="onb-sub"
        onEscapeKeyDown={(e) => (e.preventDefault(), void skip())}
        onInteractOutside={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          const on = (e.target as HTMLElement).closest("button:not([data-card]),input,select,textarea");
          if (e.ctrlKey || e.metaKey || !on) (e.preventDefault(), void next());
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement)
            .querySelector<HTMLElement>("[data-card][aria-checked=true],[data-next]")
            ?.focus();
        }}
        className="h-[min(740px,calc(100dvh-32px))] w-[min(720px,calc(100vw-32px))] gap-0 px-8 pb-[18px] pt-[26px] shadow-md max-[640px]:h-dvh max-[640px]:w-screen max-[640px]:max-h-none max-[640px]:rounded-none max-[640px]:px-[18px] max-[640px]:pb-3 max-[640px]:pt-[18px]"
      >
        <div>
          <pre className="mark kz-keep" style={{ fontSize: 6 }}>
            <span>█ █ ▄▀█ █ ▀▀█ █▀▀ █▄ █</span>
            {"\n"}
            <span>█▀▄ █▀█ █ ▄▀ ██▄ █ ▀█</span>
            {"\n"}
            <span>█ █ █ █ █ █▄▄ █▄▄ █ █</span>
          </pre>
        </div>
        <div className="mt-[22px] flex items-center gap-1.5 text-sm text-muted-foreground">
          {COPY.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to step ${i + 1}: ${NAMES[i]}`}
              title={NAMES[i]}
              onClick={() => goto(i)}
              className={cn(
                "h-[3px] rounded-[2px] p-0 transition-[background,width] motion-reduce:transition-none",
                i === step ? "w-11 bg-strong" : "w-8",
                i < step ? "bg-[color-mix(in_srgb,var(--ink)_40%,var(--line))]" : i > step && "bg-border",
              )}
            />
          ))}
          <span className="ml-1.5">
            {step + 1} of {cfg.total}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-0.5 pb-1.5 pt-[30px]">
          {step === 0 && (
            <small className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Welcome to kaizen</small>
          )}
          <DialogTitle className="text-[30px] font-bold leading-[1.15] text-strong max-[640px]:text-2xl">
            {s.title}
          </DialogTitle>
          <DialogDescription id="onb-sub" className="mb-3 max-w-[56ch] text-lg">
            {s.sub}
          </DialogDescription>
          {step === 0 && <AgentStep cfg={cfg} agent={flow.agent} more={flow.more} />}
          {step === 1 && <LookStep theme={flow.theme} />}
          {step === 2 && <AlertStep />}
          {step === 3 && (
            <Panel>
              <PhoneCard />
            </Panel>
          )}
        </div>
        <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2.5 border-t border-border pt-3.5">
          <button
            type="button"
            className="px-0.5 py-1.5 text-base text-muted-foreground hover:text-foreground"
            onClick={() => void skip()}
          >
            Skip to project setup
          </button>
          <span />
          {step > 0 && <Button onClick={back}>‹ Back</Button>}
          <Button variant="primary" data-next className="gap-2.5" onClick={() => void next()}>
            {last ? "Add your first project" : "Continue"}
            <kbd className="rounded-xs border border-current/35 px-1.5 py-px font-sans text-xs opacity-75 max-[640px]:hidden">
              {MOD} ↵
            </kbd>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// "Continue setup?" for someone who skipped or left it half done: once per browser session.
function Offer({ cfg }: { cfg: Cfg }) {
  return (
    <Dialog open onOpenChange={(o) => !o && answerOffer("later")}>
      <DialogContent className="w-[min(360px,calc(100vw-32px))] gap-0 p-[18px] shadow-md">
        <DialogTitle className="mb-1 text-[16px] font-semibold text-strong">Continue setup?</DialogTitle>
        <DialogDescription className="mb-4 text-base">{offerText(cfg)}</DialogDescription>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button variant="primary" onClick={() => answerOffer("go")}>
            Continue
          </Button>
          <Button onClick={() => answerOffer("later")}>Not now</Button>
          <Button onClick={() => answerOffer("never")}>Don't ask again</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OnboardingDialog() {
  const { cfg, flow, offer } = useOnboarding();
  if (!cfg) return null;
  return flow ? <Flow cfg={cfg} flow={flow} /> : offer ? <Offer cfg={cfg} /> : null;
}
