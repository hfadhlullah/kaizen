import { useRef, useState } from "react";
import { PLAT } from "../lib/icebox.ts";
import { addSource } from "../lib/icebox-actions.ts";
import { patchDraft, setIce, useIce } from "../lib/icebox-store.ts";
import { toast } from "../lib/toast.ts";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";
import { Field } from "./field.tsx";
import { Segmented } from "./segmented.tsx";

// Add a source: a link, or a social platform and what to follow (the server builds its link; the agent reads it). What
// is half typed stays while the drawer is shut. `dir` is the one project the board shows, "" in All projects.
export function SourceForm({ dir, projects }: { dir: string; projects: { dir: string; label: string }[] }) {
  const d = useIce((s) => s.draft),
    social = useIce((s) => s.srcKind) === "social",
    [adding, setAdding] = useState(false),
    first = useRef<HTMLInputElement>(null),
    to = d.to || dir,
    go = async () => {
      if (social ? !d.q.trim() : !d.url.trim()) return first.current?.focus();
      if (!to) return toast("Pick a project first");
      setAdding(true);
      const ok = await addSource({
        social,
        url: d.url.trim(),
        q: d.q.trim(),
        plat: d.plat,
        label: d.label.trim(),
        category: d.cat.trim(),
        to,
      });
      setAdding(false);
      if (ok) patchDraft(social ? { q: "", label: "", cat: "" } : { url: "", label: "", cat: "" });
    },
    enter = (e: React.KeyboardEvent) => e.key === "Enter" && void go();
  return (
    <div className="mb-4 flex flex-col gap-2.5 rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-foreground">Add a source</h4>
        <Segmented
          label="Kind of source"
          value={social ? "social" : "link"}
          options={[
            { id: "link", label: "Link" },
            { id: "social", label: "Social" },
          ]}
          onChange={(k) => {
            setIce({ srcKind: k });
            requestAnimationFrame(() => first.current?.focus());
          }}
        />
      </div>
      {social ? (
        <div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
          <Field label="Platform">
            {(p) => (
              <Select value={d.plat} onValueChange={(v) => patchDraft({ plat: v })}>
                <SelectTrigger id={p.id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLAT).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Follow">
            {(p) => (
              <Input
                {...p}
                ref={first}
                value={d.q}
                onChange={(e) => patchDraft({ q: e.target.value })}
                onKeyDown={enter}
                placeholder="keyword, #hashtag or @account"
                maxLength={100}
                spellCheck={false}
                autoComplete="off"
              />
            )}
          </Field>
        </div>
      ) : (
        <Field label="Link">
          {(p) => (
            <Input
              {...p}
              ref={first}
              value={d.url}
              onChange={(e) => patchDraft({ url: e.target.value })}
              onKeyDown={enter}
              placeholder="Link"
              spellCheck={false}
              autoComplete="off"
            />
          )}
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
        <Field label="Label (optional)">
          {(p) => (
            <Input
              {...p}
              value={d.label}
              onChange={(e) => patchDraft({ label: e.target.value })}
              onKeyDown={enter}
              placeholder={social ? "e.g. Mentions on X" : "e.g. Feedback Q4"}
            />
          )}
        </Field>
        <Field label="Category (optional)">
          {(p) => (
            <Input
              {...p}
              value={d.cat}
              onChange={(e) => patchDraft({ cat: e.target.value })}
              onKeyDown={enter}
              placeholder={social ? "e.g. Social" : "e.g. Bugs"}
              maxLength={40}
            />
          )}
        </Field>
      </div>
      <Field label="Project">
        {(p) => (
          <Select value={to || undefined} onValueChange={(v) => patchDraft({ to: v })}>
            <SelectTrigger id={p.id} className="w-full">
              <SelectValue placeholder="Choose project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((x) => (
                <SelectItem key={x.dir} value={x.dir} title={x.label}>
                  {x.label.split(/[\\/]/).pop()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <div className="flex justify-end">
        <Button variant="primary" disabled={adding} onClick={() => void go()}>
          {adding ? "Adding…" : "Add source"}
        </Button>
      </div>
    </div>
  );
}
