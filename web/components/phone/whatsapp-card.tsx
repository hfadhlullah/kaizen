import { useWhatsApp, waCard } from "../../lib/phone/index.ts";
import { Button } from "@web/ui";
import { CardBody, Dot, Err, Steps } from "./phone-card.tsx";
import { QrCode } from "./qr-code.tsx";

const Head = ({ children }: { children: string }) => <p className="font-semibold text-strong">{children}</p>;
const Note = ({ children }: { children: string }) => <p className="text-sm text-muted-foreground">{children}</p>;

// The WhatsApp card: Settings → Phone. Links WhatsApp Web through a QR shown by the background bridge.
export function WhatsAppCard() {
  const { s, err, busy, act } = useWhatsApp();
  if (!s)
    return (
      <CardBody>{err ? <Err text={err} /> : <p className="text-muted-foreground">Checking WhatsApp…</p>}</CardBody>
    );
  const unlink = (say: string) => (
    <Button disabled={busy} onClick={() => void act("disconnect")}>
      {busy ? say : "Unlink WhatsApp"}
    </Button>
  );
  const card = waCard(s);
  return (
    <CardBody>
      {card === "connected" && (
        <>
          <Head>WhatsApp Bridge</Head>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Dot on /> Connected as <b>{s.user || "WhatsApp"}</b>
          </p>
          <Note>Kaizen can send files and videos directly to your WhatsApp in the background.</Note>
          <div className="flex flex-wrap gap-2">{unlink("Disconnecting…")}</div>
        </>
      )}
      {card === "qr" && (
        <div className="flex flex-wrap items-start gap-5">
          <QrCode svg={s.qrSvg!} label="WhatsApp QR code" />
          <div className="grid min-w-0 flex-[1_1_220px] gap-2">
            <Head>Link WhatsApp</Head>
            <Steps>
              <li>Open WhatsApp on your phone</li>
              <li>
                Tap <b>Settings</b> or <b>⋮</b> &gt; <b>Linked Devices</b>
              </li>
              <li>
                Tap <b>Link a Device</b> and scan this QR code
              </li>
            </Steps>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void act("check")}>Refresh</Button>
              <Button onClick={() => void act("disconnect")}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
      {card === "reconnecting" && (
        <>
          <Head>WhatsApp Bridge</Head>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Dot /> Linked · reconnecting…
          </p>
          <Note>Your saved login is used; no new QR code.</Note>
          <div className="flex flex-wrap gap-2">{unlink("Unlinking…")}</div>
        </>
      )}
      {card === "connecting" && (
        <>
          <Head>WhatsApp Bridge</Head>
          <p className="text-muted-foreground">Connecting…</p>
        </>
      )}
      {card === "idle" && (
        <>
          <Head>WhatsApp Bridge</Head>
          <p>Send finished videos and files straight to your phone's WhatsApp without opening any app.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={() => void act("connect")}>
              {busy ? "Starting…" : "Link WhatsApp"}
            </Button>
          </div>
        </>
      )}
      <Err text={err} />
    </CardBody>
  );
}
