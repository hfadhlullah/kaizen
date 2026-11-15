import { useEffect, useState } from "react";
import { host } from "@lib/core";
import {
  setBrowserPref,
  setFont,
  setHaptic,
  setNotify,
  setSound,
  notifyHelp,
  clampFont,
  useSettings,
} from "@lib/settings";
import { Input, Switch } from "@web/ui";
import { Field, Segmented } from "@components/shared";
import { Stepper } from "./stepper.tsx";

const CHOICES = {
  theme: { id: "th", label: "Theme", values: ["system", "light", "dark"], help: "" },
  color: { id: "co", label: "Color", values: ["monochrome", "blue"], help: "" },
  motion: {
    id: "mo",
    label: "Motion",
    values: ["system", "full", "reduce"],
    help: "Animations across kaizen. System follows the device's reduce-motion setting.",
  },
} as const;
const permission = () => (typeof Notification === "undefined" ? null : Notification.permission);

// A choice this browser keeps for itself (Appearance, Notifications, Terminal): nothing to read back, so the row answers
// at once with no save.
export function BrowserRow({
  kind,
  off,
}: {
  kind: "theme" | "color" | "motion" | "font" | "notify" | "haptic" | "sound";
  off?: boolean;
}) {
  const prefs = useSettings((s) => s.prefs);
  if (kind === "theme" || kind === "color" || kind === "motion") {
    const c = CHOICES[kind];
    return (
      <Field row id={c.id} label={c.label} help={c.help}>
        {(_, labelId) => (
          <Segmented
            label={c.label}
            labelledBy={labelId}
            idPrefix={c.id}
            options={c.values.map((v) => ({ id: v, label: v }))}
            value={prefs[kind]}
            onChange={(v) => setBrowserPref(kind, v)}
          />
        )}
      </Field>
    );
  }
  if (kind === "font") return <FontRow />;
  if (kind === "notify")
    return (
      <Field row id="nt" label="Notifications" help={notifyHelp(permission(), prefs.notify)}>
        {(a) => <Switch {...a} checked={prefs.notify} onCheckedChange={setNotify} />}
      </Field>
    );
  if (kind === "haptic")
    return (
      <Field row id="hp" label="Haptic feedback" help="A light tick when you tap something on a phone.">
        {(a) => <Switch {...a} checked={prefs.haptic} onCheckedChange={setHaptic} />}
      </Field>
    );
  return (
    <Field row id="ns" dim={off} label="Notification sound" help="Plays with each notice. Changing it plays it.">
      {(_, labelId) => (
        <Stepper id="ns" labelledBy={labelId} values={host.notices.sounds} value={prefs.sound} onChange={setSound} />
      )}
    </Field>
  );
}

// The terminal font size: whole, inside the bounds; what is typed settles to the size kept.
function FontRow() {
  const font = useSettings((s) => s.prefs.font),
    [text, setText] = useState(String(font));
  useEffect(() => setText(String(font)), [font]);
  const commit = () => {
    const n = clampFont(text, font, host.font.min, host.font.max);
    setText(String(n));
    if (n !== font) setFont(n);
  };
  return (
    <Field
      row
      id="tf"
      label="Terminal font size"
      help="In every board terminal. Ctrl+= and Ctrl+- change it from a terminal, Ctrl+0 resets it."
    >
      {(a) => (
        <Input
          {...a}
          type="number"
          min={host.font.min}
          max={host.font.max}
          value={text}
          aria-label="Terminal font size in pixels"
          className="w-20"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
      )}
    </Field>
  );
}
