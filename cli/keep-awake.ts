// agent.keep_awake: an idle and sleep inhibitor held as a child of the board. Each one
// watches the board's pid, so a crashed board cannot leave the computer held awake.
export type Awake = "off" | "auto" | "on";

export function inhibitArgv(platform = process.platform as string, pid = process.pid): string[] | null {
  if (platform === "linux") return ["systemd-inhibit", "--what=idle:sleep", "--who=kaizen", "--why=Agents are running", "tail", `--pid=${pid}`, "-f", "/dev/null"];
  if (platform === "darwin") return ["caffeinate", "-i", "-w", String(pid)];
  return null;
}

export const wantAwake = (mode: string, agentsRunning: boolean) => mode === "on" || (mode === "auto" && agentsRunning);

export function awakeHolder(start: (argv: string[]) => { kill: () => void; exited?: Promise<unknown> } = (a) => Bun.spawn(a, { stdin: "ignore", stdout: "ignore", stderr: "ignore" }), argv = inhibitArgv()) {
  let held: { kill: () => void } | null = null;
  const stop = () => { held?.kill(); held = null; };
  return {
    stop,
    held: () => !!held,
    sync(want: boolean) {
      if (!want) return stop();
      if (held || !argv) return;
      try {
        const p = start(argv);
        held = p;
        // No systemd-inhibit session, say: next tick tries again.
        p.exited?.then(() => { if (held === p) held = null; });
      } catch { held = null; }
    },
  };
}
