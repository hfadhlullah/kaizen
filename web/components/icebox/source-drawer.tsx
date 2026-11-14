import { host } from "@lib/core";
import { type IceData, connectChatGPT, connectGoogle, disconnect, gatherAll, setIce, useIce } from "@lib/icebox";
import { Button, Icon, Sheet, SheetContent, SheetClose, SheetTitle, SheetDescription } from "@web/ui";
import { useState } from "react";
import { IconButton } from "@components/shared";
import { ServiceChip } from "./service-chip.tsx";
import { SourceCard } from "./source-card.tsx";
import { SourceForm } from "./source-form.tsx";

// The sources, in a drawer from the right: where requests come from, how each gather went, ChatGPT and Google, and the
// form to add one. Shut until asked for; the page stays where it was behind it.
export function SourceDrawer({ data, dir }: { data: IceData; dir: string }) {
  const open = useIce((s) => s.srcShow),
    adding = useIce((s) => s.srcAdd),
    draft = useIce((s) => s.draft),
    [gathering, setGathering] = useState(false),
    list = data.sources || [],
    G = data.gatherer || {},
    google = data.google || {},
    chatOn = G.use === "chatgpt" && !!G.connected,
    every = data.every && data.every !== "off" ? data.every : "",
    show = !list.length || adding || [draft.url, draft.label, draft.cat, draft.q].some(Boolean);
  return (
    <Sheet open={open} onOpenChange={(o) => setIce({ srcShow: o })}>
      <SheetContent
        aria-label="Sources"
        id="src-sec"
        // Shut, focus goes back to the Sources button (it opened the drawer without being its trigger).
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById("src-tog")?.focus();
        }}
      >
        <header className="flex flex-wrap items-start justify-between gap-2.5 border-b border-border px-6 py-5">
          <div className="flex min-w-0 flex-col gap-2">
            <SheetTitle>Sources</SheetTitle>
            <SheetDescription className="sr-only">Where requests come from</SheetDescription>
            <div className="flex flex-wrap gap-1.5">
              <ServiceChip
                icon={<Icon name="clock" />}
                label={every || "Off"}
                title={`${every ? `Checked every ${every}` : "Auto-check off"}: change in Settings`}
                onPress={() => {
                  setIce({ srcShow: false });
                  host.openSettings("sources");
                }}
              />
              <ServiceChip
                icon={<Icon name="ai" />}
                label="ChatGPT"
                connected={!!G.connected}
                title={G.connected ? `ChatGPT${G.email ? ": " + G.email : ""}` : "Connect ChatGPT"}
                onPress={() => void connectChatGPT()}
                onDisconnect={() => void disconnect("/chatgpt")}
                disconnectLabel="Disconnect ChatGPT"
              />
              <ServiceChip
                icon={<Icon name="google" />}
                label="Google"
                connected={!!google.connected}
                title={google.connected ? "Google connected" : "Connect Google"}
                onPress={() => void connectGoogle(!!google.hasClient)}
                onDisconnect={() => void disconnect("/google")}
                disconnectLabel="Disconnect Google"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {list.length > 0 && (
              <>
                <Button
                  size="sm"
                  disabled={gathering}
                  onClick={async () => {
                    setGathering(true);
                    await gatherAll(dir, list);
                    setGathering(false);
                  }}
                >
                  <Icon name="refresh" className="size-3.5" /> {gathering ? "Gathering…" : "Gather all"}
                </Button>
                <Button size="sm" aria-expanded={show} onClick={() => setIce({ srcAdd: !show })}>
                  <Icon name="plus" className="size-3.5" /> Add
                </Button>
              </>
            )}
            <SheetClose asChild>
              <IconButton icon="close" label="Close sources" aria-label="Close sources" />
            </SheetClose>
          </div>
        </header>
        <div className="flex-1 overflow-auto px-6 py-6">
          {show && <SourceForm dir={dir} projects={host.projects()} />}
          {list.length ? (
            <div className="flex flex-col gap-2.5">
              {list.map((s) => (
                <SourceCard key={s.dir + " " + s.url} s={s} chatOn={chatOn} googleConnected={!!google.connected} />
              ))}
            </div>
          ) : (
            <div className="mx-0 my-3 rounded-md border border-dashed border-border bg-background px-4 py-6 text-center">
              <div className="mx-auto mb-2.5 flex size-9 items-center justify-center text-muted-foreground">
                <Icon name="link" className="size-8" />
              </div>
              <h4 className="text-base font-semibold text-foreground">No sources yet</h4>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
