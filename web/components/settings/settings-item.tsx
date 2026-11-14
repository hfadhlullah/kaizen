import { host } from "../../lib/core/index.ts";
import { useSettings } from "../../lib/settings/index.ts";
import type { Item } from "../../lib/settings/index.ts";
import { AccountCard, AddAccountRow, NormalLoginCard } from "./account-rows.tsx";
import { AgentCard, AgentDefaultRow, AgentPermissionRow } from "./agent-rows.tsx";
import { AutomationCard, AutomationForm, NoAutomations } from "./automation-rows.tsx";
import { BrowserRow } from "./browser-row.tsx";
import { CleanupRow } from "./cleanup-row.tsx";
import { IntegrationRow } from "./integration-row.tsx";
import { MicRow } from "./mic-row.tsx";
import { PhoneCard, WhatsAppCard } from "../phone/index.ts";
import { OrchestrationFlow } from "./orchestration-flow.tsx";
import { SettingRow } from "./setting-row.tsx";
import { SkillCard } from "./skill-card.tsx";

// One row of a Settings page, drawn by its kind from what the store holds (lib/settings/settings.ts decides which rows a page has).
export function SettingsItem({ item }: { item: Item }) {
  const row = useSettings((s) => (item.kind === "row" ? s.data?.cfg?.rows.find((r) => r.key === item.ref) : undefined));
  const ref = item.ref ?? "";
  switch (item.kind) {
    case "row":
      return row ? <SettingRow row={row} off={item.off} /> : null;
    case "cleanup":
      return <CleanupRow which={ref as "records" | "runs"} />;
    case "mic":
      return <MicRow />;
    case "phone":
      return (
        <div id="phset" className="px-3.5 py-2.5">
          <PhoneCard />
        </div>
      );
    case "whatsapp":
      return (
        <div id="waset" className="px-3.5 py-2.5">
          <WhatsAppCard />
        </div>
      );
    case "google-id":
    case "google-secret":
    case "google-conn":
    case "fc-key":
    case "fc-test":
      return <IntegrationRow kind={item.kind} />;
    case "theme":
    case "color":
    case "motion":
    case "font":
    case "notify":
    case "haptic":
    case "sound":
      return <BrowserRow kind={item.kind} off={item.off} />;
    case "agent-default":
      return <AgentDefaultRow />;
    case "agent-perm":
      return <AgentPermissionRow />;
    case "agent":
      return <AgentCard cmd={ref} />;
    case "account-normal":
      return <NormalLoginCard tool={ref} />;
    case "account":
      return <AccountCard id={ref} />;
    case "account-add":
      return <AddAccountRow />;
    case "skill":
      return <SkillCard id={ref} />;
    case "automation":
      return <AutomationCard id={ref} />;
    case "automation-form":
      return <AutomationForm />;
    case "automation-none":
      return <NoAutomations />;
    case "orchestration":
      return <OrchestrationFlow />;
    default:
      return null;
  }
}
