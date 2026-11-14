import { AGENT_FAVICONS } from "../lib/agent-favicons.ts";
import { accountAdd, accountRemove, accountSend, accountSignIn } from "../lib/settings-actions.ts";
import { useSettings } from "../lib/settings-store.ts";
import { addableTools, TOOL_NAME, usageText, whoText } from "../lib/settings.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "../ui/button.tsx";
import { CommitInput } from "./commit-input.tsx";

type Login = { signedIn: boolean; who?: string; plan?: string; via?: string; usage: any; usageKnown?: boolean };
function Lines({ a }: { a: Login }) {
  const who = whoText(a),
    u = usageText(a.usage, a.signedIn, a.usageKnown !== false);
  return (
    <>
      {who && <span className="block text-xs text-foreground">{who}</span>}
      <span className={cn("text-xs text-muted-foreground", u.bad && "text-warning")}>{u.text}</span>
    </>
  );
}
const needsSignIn = (a: Login) => !a.signedIn || a.usage?.expired;

// An account kaizen keeps a folder for: rename it, sign in, make it the default for its tool, or remove it.
export function AccountCard({ id }: { id: string }) {
  const a = useSettings((s) => s.data?.accounts?.accounts.find((x: any) => x.id === id));
  if (!a) return null;
  return (
    <div className="px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <img src={AGENT_FAVICONS[a.tool] ?? ""} alt="" width={28} height={28} className="size-7 shrink-0 rounded-sm" />
        <span className="min-w-0 flex-[1_1_200px]">
          <CommitInput
            value={a.name}
            maxLength={60}
            autoComplete="off"
            spellCheck={false}
            aria-label="Account name, click to rename"
            title="Click to rename"
            data-ac-name={a.id}
            className="-ml-1.5 h-6 max-w-70 border-transparent bg-transparent px-1.5 font-medium"
            onCommit={(v) => void accountSend({ op: "rename", id: a.id, name: v })}
          />
          <Lines a={a} />
        </span>
        {needsSignIn(a) && (
          <Button data-ac-sign={a.id} onClick={() => void accountSignIn(a.id, a.tool)}>
            Sign in
          </Button>
        )}
        <Button
          data-ac-def={a.isDefault ? "" : a.id}
          aria-pressed={a.isDefault}
          onClick={() => void accountSend({ op: "default", tool: a.tool, id: a.isDefault ? "" : a.id })}
        >
          {a.isDefault ? "✓ Default" : "Default"}
        </Button>
        <Button data-ac-rm={a.id} onClick={() => void accountRemove(a.id, a.name)}>
          Remove
        </Button>
      </div>
      {needsSignIn(a) && <SignInLine line={a.signIn} />}
    </div>
  );
}
const SignInLine = ({ line }: { line: string }) => (
  <div className="mt-1.5 text-xs text-muted-foreground">
    <code className="break-words">{line}</code>
  </div>
);

// The login the tool uses on its own (~/.claude, ~/.codex): first in its section, Default unless an account below is.
export function NormalLoginCard({ tool }: { tool: string }) {
  const n = useSettings((s) => s.data?.accounts?.normal?.find((x: any) => x.tool === tool));
  if (!n) return null;
  return (
    <div className="px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <img src={AGENT_FAVICONS[tool] ?? ""} alt="" width={28} height={28} className="size-7 shrink-0 rounded-sm" />
        <span className="min-w-0 flex-[1_1_200px]">
          <span className="block font-medium">
            Your login <i className="ml-1.5 font-mono text-[11px] not-italic text-muted-foreground">~/.{tool}</i>
          </span>
          <Lines a={n} />
        </span>
        {needsSignIn(n) && (
          <Button data-ac-sign="" onClick={() => void accountSignIn("", tool)}>
            Sign in
          </Button>
        )}
        {!n.noAccounts && (
          <Button
            data-ac-def=""
            aria-pressed={n.isDefault}
            disabled={n.isDefault}
            className="disabled:opacity-100"
            title={n.isDefault ? "Runs use this login" : "Use this login for runs again"}
            onClick={() => void accountSend({ op: "default", tool, id: "" })}
          >
            {n.isDefault ? "✓ Default" : "Default"}
          </Button>
        )}
      </div>
      {needsSignIn(n) && <SignInLine line={n.signIn} />}
    </div>
  );
}

export function AddAccountRow() {
  const ac = useSettings((s) => s.data?.accounts);
  if (!ac) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-3">
      {addableTools(ac).map((t) => (
        <Button key={t} data-ac-new={t} disabled={ac.windows} onClick={() => void accountAdd(t)}>
          <img src={AGENT_FAVICONS[t]} alt="" width={16} height={16} className="rounded-[3px]" />
          Add {TOOL_NAME[t]} account
        </Button>
      ))}
    </div>
  );
}
