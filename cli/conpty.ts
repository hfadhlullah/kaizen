// Windows has no Bun.Terminal, so the in-card terminal there runs through a small
// ConPTY host: PowerShell compiles the C# below with Add-Type, starts the command in
// a pseudo console, and bridges it to plain pipes. Its stdout is the screen, its
// stdin the keys. A resize travels in-band on stdin as ESC ] kzr;<cols>;<rows> BEL,
// a sequence no key produces, and is taken out before the rest reaches the console.
const HOST = String.raw`
using System; using System.IO; using System.Threading; using System.Runtime.InteropServices;
public static class KzPty {
  [StructLayout(LayoutKind.Sequential)] struct COORD { public short X, Y; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string r, d, t; public int x, y, w, h, cx, cy, fa, fl; public short sw, r2; public IntPtr r3, i, o, e; }
  [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO si; public IntPtr attrs; }
  [StructLayout(LayoutKind.Sequential)] struct PI { public IntPtr hp, ht; public int pid, tid; }
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CreatePipe(out IntPtr r, out IntPtr w, IntPtr a, int s);
  [DllImport("kernel32.dll")] static extern int CreatePseudoConsole(COORD c, IntPtr i, IntPtr o, uint f, out IntPtr h);
  [DllImport("kernel32.dll")] static extern int ResizePseudoConsole(IntPtr h, COORD c);
  [DllImport("kernel32.dll")] static extern void ClosePseudoConsole(IntPtr h);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr l, int n, int f, ref IntPtr s);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr l, uint f, IntPtr a, IntPtr v, IntPtr s, IntPtr p, IntPtr r);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool CreateProcessW(string app, string cmd, IntPtr pa, IntPtr ta, bool inh, uint f, IntPtr env, string cwd, ref STARTUPINFOEX si, out PI pi);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h, out int c);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  static COORD Size(int c, int r) { COORD s; s.X = (short)c; s.Y = (short)r; return s; }
  static FileStream Of(IntPtr h, FileAccess a) { return new FileStream(new Microsoft.Win32.SafeHandles.SafeFileHandle(h, true), a); }
  public static int Run(string cmd, int cols, int rows) {
    IntPtr inR, inW, outR, outW, hpc;
    if (!CreatePipe(out inR, out inW, IntPtr.Zero, 0) || !CreatePipe(out outR, out outW, IntPtr.Zero, 0)) return 1;
    int hr = CreatePseudoConsole(Size(cols, rows), inR, outW, 0, out hpc);
    if (hr != 0) { Console.Error.WriteLine("CreatePseudoConsole failed: " + hr); return 1; }
    IntPtr sz = IntPtr.Zero;
    InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref sz);
    var si = new STARTUPINFOEX(); si.si.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
    // STARTF_USESTDHANDLES with none: otherwise the child takes this host's piped stdio, not the console.
    si.si.fl = 0x100;
    si.attrs = Marshal.AllocHGlobal(sz);
    if (!InitializeProcThreadAttributeList(si.attrs, 1, 0, ref sz)
      || !UpdateProcThreadAttribute(si.attrs, 0, (IntPtr)0x20016, hpc, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero)) return 1;
    PI pi;
    if (!CreateProcessW(null, cmd, IntPtr.Zero, IntPtr.Zero, false, 0x80000, IntPtr.Zero, null, ref si, out pi)) {
      Console.Error.WriteLine("CreateProcess failed: " + Marshal.GetLastWin32Error()); return 1; }
    // The console holds its own copies; ours would keep the pipes open past its end.
    CloseHandle(inR); CloseHandle(outW);
    var input = Of(inW, FileAccess.Write); var output = Of(outR, FileAccess.Read);
    var stdout = Console.OpenStandardOutput();
    var pump = new Thread(() => {
      var b = new byte[16384]; int n;
      try { while ((n = output.Read(b, 0, b.Length)) > 0) { stdout.Write(b, 0, n); stdout.Flush(); } } catch { }
    });
    pump.IsBackground = true; pump.Start();
    var keys = new Thread(() => {
      var stdin = Console.OpenStandardInput(); var b = new byte[4096]; int n;
      var held = new MemoryStream();
      try {
        while ((n = stdin.Read(b, 0, b.Length)) > 0) {
          // ponytail: a UTF-8 character split across two reads decodes as U+FFFD; hold incomplete tails if that shows up.
          held.Write(b, 0, n);
          var s = System.Text.Encoding.UTF8.GetString(held.ToArray());
          // A resize cut in half by the pipe waits for its other half.
          int keep = s.LastIndexOf("\x1b]kzr;");
          if (keep >= 0 && s.IndexOf('\x07', keep) < 0) { held = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(s.Substring(keep))); s = s.Substring(0, keep); }
          else held = new MemoryStream();
          s = System.Text.RegularExpressions.Regex.Replace(s, "\x1b]kzr;(\\d+);(\\d+)\x07", m => {
            ResizePseudoConsole(hpc, Size(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value))); return ""; });
          var o = System.Text.Encoding.UTF8.GetBytes(s);
          if (o.Length > 0) { input.Write(o, 0, o.Length); input.Flush(); }
        }
      } catch { }
    });
    keys.IsBackground = true; keys.Start();
    WaitForSingleObject(pi.hp, 0xFFFFFFFF);
    int code; GetExitCodeProcess(pi.hp, out code);
    // Closing the console flushes its last frame into the pump, then ends it.
    ClosePseudoConsole(hpc);
    pump.Join(2000);
    return code;
  }
}`;

// The PowerShell that hosts it: the child's command line, size and directory come in
// through the environment, so nothing the agent is given passes through a quoting layer.
const SCRIPT = `Add-Type -TypeDefinition @'
${HOST}
'@
Set-Location -LiteralPath $env:KZ_PTY_CWD
exit [KzPty]::Run($env:KZ_PTY_CMD, [int]$env:KZ_PTY_COLS, [int]$env:KZ_PTY_ROWS)`;

export const conptyHost = () => Buffer.from(SCRIPT, "utf16le").toString("base64");

export const resizeSeq = (cols: number, rows: number) => `\x1b]kzr;${cols};${rows}\x07`;

// The command line the pseudo console starts: PowerShell running cmd. It finds .cmd
// shims (npm installs claude as one), which CreateProcess alone does not, and takes
// the arguments as -EncodedCommand, as findTerminal does, so newlines survive.
export function innerCommand(shell: string, cmd: string[]): string {
  const q = (a: string) => `'${a.replace(/'/g, "''")}'`;
  const enc = Buffer.from(`& ${cmd.map(q).join(" ")}`, "utf16le").toString("base64");
  return `"${shell}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${enc}`;
}
