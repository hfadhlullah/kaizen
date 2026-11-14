import { loadSettings } from "../../lib/settings/index.ts";
import type { Section } from "../../lib/settings/index.ts";
import { Button } from "@web/ui";
import { SettingsItem } from "./settings-item.tsx";

// A subsection: its name over a rounded box with hairline dividers between rows. A section with no name (Orchestration's
// picture) draws its rows with no box. Refresh and Re-check read the page again.
export function SettingsSection({ section }: { section: Section }) {
  if (!section.title) return section.items.map((i) => <SettingsItem key={i.id} item={i} />);
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="mb-2 flex items-center justify-between text-sm font-semibold normal-case tracking-normal text-strong">
        {section.title}
        {section.extra && (
          <Button
            id={section.extra === "refresh" ? "ag-refresh" : "sk-recheck"}
            variant="ghost"
            size="sm"
            className="text-primary"
            onClick={() => void loadSettings()}
          >
            {section.extra === "refresh" ? "Refresh" : "Re-check"}
          </Button>
        )}
      </h3>
      <div className="@container divide-y divide-border rounded-lg border border-border bg-card">
        {section.items.map((i) => (
          <SettingsItem key={i.id} item={i} />
        ))}
      </div>
    </section>
  );
}
