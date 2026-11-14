import type { ReactNode } from "react";
import { usePhoneSetup } from "../lib/hooks/use-phone-setup.ts";
import { phoneLine, TAILSCALE_DOWNLOAD } from "../lib/phone-setup.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "../ui/button.tsx";
import { QrCode } from "./qr-code.tsx";

export const Link = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="text-primary" href={href} target="_blank" rel="noopener">
    {children}
  </a>
);
export const Steps = ({ children }: { children: ReactNode }) => (
  <ol className="grid list-decimal gap-1 pl-5 text-foreground">{children}</ol>
);
export const Err = ({ text }: { text: string }) =>
  text ? (
    <p role="alert" className="text-sm text-danger">
      {text}
    </p>
  ) : null;
export const Dot = ({ on }: { on?: boolean }) => (
  <i className={cn("size-[7px] flex-none rounded-full", on ? "bg-success" : "bg-muted-foreground")} />
);
// The card body: its rows 12 px apart, as Settings and the onboarding phone step both show it.
export const CardBody = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-3 text-base leading-normal text-foreground">{children}</div>
);

// The phone card: Settings → Phone and the onboarding phone step. Walks from no Tailscale to a QR the phone scans.
export function PhoneCard() {
  const { s, err, busy, act } = usePhoneSetup();
  const check = <Button onClick={() => void act("check")}>Check again</Button>;
  if (!s)
    return (
      <CardBody>{err ? <Err text={err} /> : <p className="text-muted-foreground">Checking Tailscale…</p>}</CardBody>
    );
  const acct = s.account ? <b>{s.account}</b> : "the same account";
  if (s.state === "missing")
    return (
      <CardBody>
        <p>Your phone reaches this computer through Tailscale, a free private network between your own devices.</p>
        <Steps>
          <li>Install Tailscale on this computer and log in.</li>
          <li>Install it on your phone too and log in with the same account.</li>
        </Steps>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" asChild>
            <a href={TAILSCALE_DOWNLOAD} target="_blank" rel="noopener">
              Install Tailscale
            </a>
          </Button>
          {check}
        </div>
        <Err text={err} />
      </CardBody>
    );
  if (s.state === "login")
    return (
      <CardBody>
        <p>Tailscale is installed but not logged in on this computer.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!!busy} onClick={() => void act("login")}>
            {busy === "login" ? "Opening…" : "Log in to Tailscale"}
          </Button>
          {check}
        </div>
        <Err text={err} />
      </CardBody>
    );
  if (s.state === "ready")
    return (
      <CardBody>
        <p>Tailscale is running{s.account ? <> as {acct}</> : ""}. Connect to show the code your phone scans.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!!busy} onClick={() => void act("connect")}>
            {busy === "connect" ? "Connecting…" : "Connect phone"}
          </Button>
        </div>
        <Err text={err} />
      </CardBody>
    );
  const line = phoneLine(s.phones);
  return (
    <CardBody>
      <div className="flex flex-wrap items-start gap-5">
        {s.qr && <QrCode svg={s.qr} label={`QR code for ${s.url}`} />}
        <div className="grid min-w-0 flex-[1_1_220px] gap-2">
          <p className="font-semibold text-strong">On your phone</p>
          <Steps>
            <li>
              Install Tailscale from the <Link href={TAILSCALE_DOWNLOAD}>App Store or Play Store</Link>.
            </li>
            <li>
              {s.account ? (
                <>Log in with {acct}, the account this computer uses.</>
              ) : (
                "Log in with the same account as this computer."
              )}
            </li>
            <li>
              Scan this code with the camera, or open <Link href={s.url}>{s.url}</Link>.
            </li>
            <li>Choose Add to Home screen so it opens like an app.</li>
          </Steps>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Dot on={line.on} />
            {line.text}
          </p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Anyone on your tailnet can use this board. Keep the tailnet to your own devices, or limit it with Tailscale
        access rules.
      </p>
      <Err text={err} />
    </CardBody>
  );
}
