import type { ReactNode } from "react";
import {
  googleConnect,
  removeResearchKey,
  saveGoogleClient,
  saveResearchKey,
  testResearchKey,
  setTyped,
  useSettings,
} from "../../lib/settings/index.ts";
import { Button, Input } from "@web/ui";
import { Field } from "../shared/index.ts";

const wide = "w-60 @max-[520px]:w-full";
// A key or secret box: what is typed stays in the store until Save, and the server only ever answers with the last four.
function Secret({
  id,
  placeholder,
  password,
  disabled,
}: {
  id: string;
  placeholder: string;
  password?: boolean;
  disabled?: boolean;
}) {
  const text = useSettings((s) => s.typed[id] ?? "");
  return (
    <Input
      id={id}
      type={password ? "password" : "text"}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      autoComplete="off"
      className={wide}
      onChange={(e) => setTyped(id, e.target.value)}
    />
  );
}
const pair = (a: ReactNode, b: ReactNode) => (
  <span className="inline-flex items-center gap-1.5 @max-[520px]:w-full">
    {a}
    {b}
  </span>
);

// Settings → Integrations: Google (the OAuth client, then the account) and Research (the Firecrawl key).
export function IntegrationRow({
  kind,
}: {
  kind: "google-id" | "google-secret" | "google-conn" | "fc-key" | "fc-test";
}) {
  const gg = useSettings((s) => s.data?.google ?? {}),
    rk = useSettings((s) => s.data?.research),
    typed = useSettings((s) => s.typed),
    busy = useSettings((s) => s.busy);
  const saved = gg.hasClient ? "Saved. Paste a new one to replace it" : "";
  if (kind === "google-id")
    return (
      <Field row id="gg-id" label="OAuth client id">
        {() => <Secret id="gg-id" placeholder={gg.hasClient ? saved : "Desktop app client id from Google Cloud"} />}
      </Field>
    );
  if (kind === "google-secret")
    return (
      <Field row id="gg-secret" label="OAuth client secret">
        {() =>
          pair(
            <Secret id="gg-secret" password placeholder={saved} />,
            <Button id="gg-save" onClick={() => void saveGoogleClient(typed["gg-id"] ?? "", typed["gg-secret"] ?? "")}>
              Save
            </Button>,
          )
        }
      </Field>
    );
  if (kind === "google-conn")
    return (
      <Field row id="gg-conn" label="Google account">
        {() => (
          <Button
            id="gg-conn"
            variant={gg.connected ? "default" : "primary"}
            disabled={!gg.hasClient && !gg.connected}
            onClick={() => void googleConnect(!!gg.connected)}
          >
            {gg.connected ? "Disconnect" : "Connect"}
          </Button>
        )}
      </Field>
    );
  if (!rk) return null;
  // Firecrawl for `kaizen search` / `kaizen scrape`: the key goes in, only its last four come back.
  const fromEnv = rk.source === "env";
  if (kind === "fc-key")
    return (
      <Field
        row
        id="fc-key"
        label="Firecrawl API key"
        help={
          fromEnv ? (
            `Set by FIRECRAWL_API_KEY in the board's environment (${rk.hint}); that one wins.`
          ) : (
            <>
              Your own key from{" "}
              <a className="text-primary" href="https://www.firecrawl.dev/app/api-keys" target="_blank" rel="noopener">
                firecrawl.dev
              </a>
              . Agents search the web with <code>kaizen search</code> and read pages with <code>kaizen scrape</code>;
              Explore uses it first. Kept in ~/.kaizen/firecrawl.json, on this machine only.
            </>
          )
        }
      >
        {() =>
          pair(
            <Secret
              id="fc-key"
              password
              disabled={fromEnv}
              placeholder={rk.set ? "Paste a new key to replace it" : "fc-…"}
            />,
            <Button id="fc-save" disabled={fromEnv} onClick={() => void saveResearchKey(typed["fc-key"] ?? "")}>
              Save
            </Button>,
          )
        }
      </Field>
    );
  return (
    <Field
      row
      id="fc-test"
      label="Status"
      help={
        rk.set
          ? `Key saved (${rk.hint}). Test spends one search credit.`
          : "Not set. Without it, agents use their own web tools."
      }
    >
      {() =>
        pair(
          <Button id="fc-test" disabled={!rk.set || busy === "fc-test"} onClick={() => void testResearchKey()}>
            {busy === "fc-test" ? "Testing…" : "Test"}
          </Button>,
          rk.set && !fromEnv ? (
            <Button id="fc-del" onClick={() => void removeResearchKey()}>
              Remove
            </Button>
          ) : null,
        )
      }
    </Field>
  );
}
