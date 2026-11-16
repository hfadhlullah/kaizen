import type { ReactNode } from "react";
import {
  AGENT_FAVICONS,
  pickFolder,
  resetSetting,
  saveSetting,
  useSettings,
  controlOf,
  useModelChoices,
  modelName,
  modelTool,
  rowHint,
  settingId,
  type Row,
} from "@lib/settings";
import { host } from "@lib/core";
import { Button, Switch } from "@web/ui";
import { CommitInput } from "./commit-input.tsx";
import { Field, Segmented } from "@components/shared";
import { Stepper } from "./stepper.tsx";

const wide = "w-60 @max-[520px]:w-full";
const caps = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// One config row: its label and help on the left, the control that suits its values on the right, a Reset where a
// project sets the value itself. A pick shows at once and saves; the server's answer replaces it.
export function SettingRow({ row, off }: { row: Row; off?: boolean }) {
  const scoped = useSettings((s) => s.data?.cfg?.scope !== "all"),
    shown = useSettings((s) => s.local[row.key] ?? row.value),
    id = settingId(row.key),
    kind = controlOf(row),
    model = kind === "model",
    choices = useModelChoices(modelTool(row.key), model);
  const text = rowHint(row);
  const help: ReactNode =
    row.own && scoped ? (
      <>
        {text && `${text} · `}Set for this project ·{" "}
        <button
          type="button"
          id={`${id}-reset`}
          className="text-primary underline underline-offset-2"
          onClick={() => void resetSetting(row.key)}
        >
          Reset
        </button>
      </>
    ) : (
      text
    );
  const save = (v: string) => void saveSetting(row.key, v);
  const label: ReactNode = model ? (
    <span className="inline-flex items-center gap-1.5">
      <img
        src={AGENT_FAVICONS[modelTool(row.key)] ?? ""}
        alt=""
        width={16}
        height={16}
        className="size-4 rounded-[3px]"
      />
      {modelName(row.label)}
    </span>
  ) : (
    row.label
  );
  return (
    <Field row id={id} dim={off} label={label} help={help}>
      {(a, labelId) => {
        if (kind === "switch")
          return (
            <Switch
              {...a}
              checked={shown === "true"}
              title={shown === "true" ? "On" : "Off"}
              onCheckedChange={(on) => save(String(on))}
            />
          );
        if (kind === "preset" || kind === "segments") {
          const vals = row.values;
          // The preset is a control over the tiers; custom is what any edit to another row makes, so it lights up but cannot be picked.
          return (
            <Segmented
              label={row.label}
              labelledBy={labelId}
              idPrefix={id}
              options={vals.map((v) => ({ id: v, label: kind === "preset" ? caps(v) : v }))}
              value={shown}
              onChange={(v) => v !== "custom" && save(v)}
            />
          );
        }
        if (kind === "stepper")
          return <Stepper id={id} labelledBy={labelId} values={row.values} value={shown} delay={300} onChange={save} />;
        const field = (
          <CommitInput
            {...a}
            value={row.value}
            placeholder={model ? "inherit" : "not set"}
            list={model ? `${id}-dl` : undefined}
            spellCheck={false}
            autoComplete="off"
            className={wide}
            onCommit={(v) => saveSetting(row.key, v).then(() => host.reload())}
          />
        );
        if (kind === "folder")
          return (
            <span className="inline-flex items-center gap-1.5 @max-[520px]:w-full">
              {field}
              <Button id={`${id}-pick`} onClick={() => void pickFolder(row.key)}>
                Browse…
              </Button>
            </span>
          );
        if (model)
          return (
            <span>
              {field}
              {choices.length > 0 && (
                <datalist id={`${id}-dl`}>
                  {choices.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </datalist>
              )}
            </span>
          );
        return field;
      }}
    </Field>
  );
}
