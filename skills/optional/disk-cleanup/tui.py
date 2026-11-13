"""Shared box/panel component for disk-cleanup reports.
Use: sys.path.insert(0, os.path.expanduser("~/.claude/skills/disk-cleanup")); from tui import *
Sizes are bytes everywhere. Helpers: GB(n), MB(n), KB(n) build bytes."""
W = 38          # box inner width
KB = lambda n: int(n * 1024)
MB = lambda n: int(n * 1024**2)
GB = lambda n: int(n * 1024**3)

def size(b):
    """Bytes -> '1.5 TB' / '1500 GB' / '52 MB' / '4 KB' / '0 B' (TB from 1024 GB)."""
    for u, d in (("TB", 1024**4), ("GB", 1024**3), ("MB", 1024**2), ("KB", 1024)):
        if b >= d:
            v = b / d
            return f"{v:.0f} {u}" if v >= 10 else f"{v:.1f} {u}"
    return f"{b} B"

def bold(s):
    return "".join(chr(0x1D5D4+ord(c)-65) if "A"<=c<="Z" else chr(0x1D5EE+ord(c)-97) if "a"<=c<="z" else chr(0x1D7EC+ord(c)-48) if c.isdigit() else c for c in s)

def w(s):
    """Display width: emoji squares = 2 cells."""
    return sum(2 if ord(c) >= 0x1F000 or c == "⬜" else 1 for c in s)

def gauge(used, limit, n=5):
    r = used / limit; f = min(n, round(r * n))
    c = "🟩" if r < .5 else "🟨" if r < .75 else "🟧" if r < .9 else "🟥"
    return c * f + "⬜" * (n - f)

def bar(b, top, bw):
    h = round(b / top * bw * 2)            # half-cells, scaled to the box's biggest row
    return ("▏" if h == 0 else "█" * (h // 2) + ("▌" if h % 2 else "")).ljust(bw)

def box(title, rows, used, limit):
    """rows = [(name, bytes, flag)]; flag optional ('✗'). Bars scale to the box's biggest row; gauge shows box total vs limit."""
    rows = [(r + ("",))[:3] for r in rows]
    top = max(b for _, b, _ in rows)
    lw = max(len(n) for n, _, _ in rows)
    sw = max(len(size(b)) for _, b, _ in rows)
    fw = max(len(f) for _, _, f in rows)
    bw = W - 2 - lw - sw - 2 - (fw + 1 if fw else 0)       # bar fills the gap
    body = ["│ " + (f"{n:<{lw}} {bar(b, top, bw)} {size(b):>{sw}}" + (f" {f}" if fw else "")).ljust(W - 1) + "│"
            for n, b, f in rows]
    tag = f"{size(used)} {gauge(used, limit)}"
    head = "┌─ " + bold(title) + " " + "─" * (W - len(title) - w(tag) - 5) + " " + tag + " ┐"
    return [head, "│" + " " * W + "│"] + body + ["└" + "─" * W + "┘"]

def side_by_side(a, b):
    n = max(len(a), len(b)); a += [" " * 40] * (n - len(a)); b += [" " * 40] * (n - len(b))
    return [x + " " * (41 - w(x)) + y for x, y in zip(a, b)]

def panel(title, rows, foot, pw=62):
    """Verdict panel: rows = [(line, note)], double-line box."""
    out = ["╔═ " + bold(title) + " " + "═" * (pw - len(title) - 3) + "╗"]
    for i, (line, note) in enumerate(rows, 1):
        out += ["║ " + f"[{i}] {line}".ljust(pw - 1) + "║", "║ " + f"    └ {note}".ljust(pw - 1) + "║"]
    return out + ["╠" + "═" * pw + "╣", "║ " + foot.ljust(pw - 1) + "║", "╚" + "═" * pw + "╝"]

FILL = "█▓▒"   # block-element glyphs only (▤ ▚ fell back to another font and broke widths)

def storage(segments, total, free, title="DISK", width=79):
    """Full-width disk bar in one box (Apple-storage style). segments = [(label, bytes)], disjoint,
    drawn in order with patterns █ ▤ ▚ ░; rest of used = other (░ if free), unused = FREE (blank).
    Top-right of the box = real disk size. Returns lines, same width as two boxes side by side."""
    other = max(0, total - free - sum(b for _, b in segments))
    parts = [(l, b, FILL[i % 3]) for i, (l, b) in enumerate(segments)] + [("other", other, "░"), ("free", free, " ")]
    n = width - 2
    raw = [b / total * n for _, b, _ in parts]
    cells = [int(r) for r in raw]
    for i in sorted(range(len(parts)), key=lambda i: raw[i] - cells[i], reverse=True)[: n - sum(cells)]:
        cells[i] += 1
    for i, (_, b, _) in enumerate(parts):          # never hide a non-empty part
        if b and not cells[i]:
            cells[cells.index(max(cells))] -= 1; cells[i] = 1
    legend, cur = [], ""
    for l, b, c in parts:
        item = f"{c} {l.lower()} {size(b).replace(' ', '')}".strip()
        if cur and len(cur) + 2 + len(item) > n:
            legend.append(cur); cur = item
        else:
            cur = f"{cur}  {item}" if cur else item
    legend.append(cur)
    tag = size(total)
    head = "┌─ " + bold(title) + " " + "─" * (width - len(title) - len(tag) - 5) + " " + tag + " ┐"
    row = lambda t: "│ " + t.ljust(n) + " │"
    return [head, row(""), row("".join(c * k for (_, _, c), k in zip(parts, cells)))] + [row(x) for x in legend] + ["└" + "─" * width + "┘"]

def render(*boxes):
    """Print boxes two per row."""
    for i in range(0, len(boxes), 2):
        print("\n".join(side_by_side(boxes[i], boxes[i+1]) if i+1 < len(boxes) else boxes[i]))
