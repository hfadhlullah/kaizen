import {
  ago,
  iceKey,
  STYLES,
  type IceItem,
  replyAgain,
  replyCancel,
  replyDraft,
  replySend,
  replyStyle,
  replyText,
  setReplyStyle,
  useIce,
} from "../../lib/icebox/index.ts";
import { cn } from "../../lib/core/index.ts";
import { Button, fieldClass, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@web/ui";
import { Field } from "../shared/index.ts";

const Style = ({ dir, disabled }: { dir: string; disabled: boolean }) => (
  <Select value={replyStyle(dir)} onValueChange={(v) => setReplyStyle(dir, v)} disabled={disabled}>
    <SelectTrigger aria-label="Reply style" size="sm" className="w-auto">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {Object.entries(STYLES).map(([v, l]) => (
        <SelectItem key={v} value={v}>
          {l}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
// A gathered post can be answered: Reply drafts, the box is the approval, Send reply posts that text.
export function ReplyBox({ item, chat }: { item: IceItem; chat: boolean }) {
  const k = iceKey(item),
    r = useIce((s) => (s.reply?.k === k ? s.reply : null));
  useIce((s) => s.styles); // the style select follows a change of it
  if (!item.post) return null;
  if (item.replied)
    return <span className="text-sm text-muted-foreground">You replied to this post {ago(item.replied)}.</span>;
  if (!r)
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">You review it before it posts.</span>
        {chat && <Style dir={item.dir} disabled={false} />}
        <Button size="sm" onClick={() => void replyDraft(item)}>
          Reply
        </Button>
      </div>
    );
  if (r.wait) return <span className="text-sm text-muted-foreground">Drafting…</span>;
  const off = !!(r.busy || r.again);
  return (
    <div className="grid gap-1.5 border-t border-border pt-2">
      <Field label={`Your reply${r.note ? ` · ${r.note}` : ""}`}>
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            maxLength={2000}
            disabled={off}
            value={r.text}
            onChange={(e) => replyText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && replyCancel()}
            autoFocus
            className={cn(fieldClass, "h-auto resize-y bg-card py-1.5")}
          />
        )}
      </Field>
      <span className="text-sm text-muted-foreground">{r.again ? "Writing another…" : `${r.text.length} chars`}</span>
      <div className="flex items-center gap-1.5">
        <span className="flex-1" />
        {chat && <Style dir={item.dir} disabled={off} />}
        {chat && (
          <Button variant="ghost" size="sm" disabled={off} onClick={() => void replyAgain(item)}>
            Regenerate
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={!!r.busy} onClick={replyCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" disabled={off || !r.text.trim()} onClick={() => void replySend(item)}>
          {r.busy ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </div>
  );
}
