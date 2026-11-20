import { host } from "@lib/core";
import { useSettings } from "@lib/settings";
import type { Item } from "@lib/settings";
import { AccountCard, AddAccountRow, NormalLoginCard } from "./account-rows.tsx";
import { AgentCard, AgentDefaultRow, AgentPermissionRow } from "./agent-rows.tsx";
import { AutomationCard, AutomationForm, NoAutomations } from "./automation-rows.tsx";
import { BrowserRow } from "./browser-row.tsx";
import { CleanupRow } from "./cleanup-row.tsx";
import { IntegrationRow } from "./integration-row.tsx";
import { MicRow } from "./mic-row.tsx";
import { PhoneCard, WhatsAppCard } from "@components/phone";
import { OrchestrationFlow } from "./orchestration-flow.tsx";
import { SettingRow } from "./setting-row.tsx";
import { AgentSetupCard, BunCard, MoreSkills, MySkillsSearch, NoSkills, OutsideSkillCard, PluginSkillCard, SkillCard, SkillTabs } from "./skill-card.tsx";
import { SkillStore } from "./skill-store.tsx";

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
    case "skill-bun":
      return <BunCard />;
    case "skill-setup":
      return <AgentSetupCard />;
    case "skill-tabs":
      return <SkillTabs />;
    case "skill-store":
      return <SkillStore />;
    case "skill-outside":
      return <OutsideSkillCard id={ref} />;
    case "skill-more":
      return <MoreSkills />;
    case "skill-mine-search":
      return <MySkillsSearch />;
    case "skill-none":
      return <NoSkills />;
    case "skill-plugin":
      return <PluginSkillCard plugin={ref} />;
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
