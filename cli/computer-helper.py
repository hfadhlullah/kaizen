#!/usr/bin/env python3
"""Reads and acts on the Linux accessibility tree (AT-SPI) for `kaizen computer`.

One JSON object on stdout per call. Verbs: check, apps, windows, state, click,
set-value, type. Written for kaizen; the limits and the two refusals below are the
point: an app on the blocklist is matched by name before anything of it is read, and
a password field never gives a value or takes text.
"""
import json
import os
import sys
import time

MAX_NODES, MAX_DEPTH, MAX_TEXT, MAX_INPUT = 300, 8, 200, 10000
# Matched as a lowercase part of the app's name, before its tree is read.
BLOCKED = (
    "1password", "bitwarden", "keepass", "lastpass", "dashlane", "enpass", "nordpass",
    "proton pass", "keeper", "roboform", "seahorse", "kwallet", "gnome-keyring", "authy",
    "authenticator", "yubico", "ente auth", "buttercup", "psono",
)
SECURE = "password text"
SETTLE = 0.3  # apps repaint their accessible a moment after an action; the next read should see it
SHOWN_STATES = ("checked", "selected", "focused", "editable", "expanded", "collapsed", "busy", "required")
CLICK_NAMES = ("click", "press", "activate", "jump", "toggle", "select")


class Fail(Exception):
    def __init__(self, code, msg):
        super().__init__(msg)
        self.code, self.msg = code, msg


def blocked(name):
    n = (name or "").lower()
    return any(b in n for b in BLOCKED)


class Node:
    """One accessible. Tests swap in a fake with the same methods."""

    def __init__(self, a):
        self.a = a

    def role(self):
        return self.a.get_role_name() or ""

    def name(self):
        return self.a.get_name() or ""

    def states(self):
        return [getattr(s, "value_nick", str(s)).replace("-", " ") for s in self.a.get_state_set().get_states()]

    def count(self):
        return self.a.get_child_count()

    def child(self, i):
        c = self.a.get_child_at_index(i)
        return Node(c) if c else None

    def text(self, cap):
        from gi.repository import Atspi
        t = self.a.get_text_iface()
        return None if t is None else Atspi.Text.get_text(t, 0, min(Atspi.Text.get_character_count(t), cap))

    def number(self):
        from gi.repository import Atspi
        v = self.a.get_value_iface()
        return None if v is None else Atspi.Value.get_current_value(v)

    def actions(self):
        from gi.repository import Atspi
        i = self.a.get_action_iface()
        return [] if i is None else [Atspi.Action.get_action_name(i, n) for n in range(Atspi.Action.get_n_actions(i))]

    def do(self, n):
        from gi.repository import Atspi
        return Atspi.Action.do_action(self.a.get_action_iface(), n)

    def editable(self):
        return self.a.get_editable_text_iface() is not None

    def set_text(self, s):
        from gi.repository import Atspi
        return Atspi.EditableText.set_text_contents(self.a.get_editable_text_iface(), s)

    def append_text(self, s):
        from gi.repository import Atspi
        e, t = self.a.get_editable_text_iface(), self.a.get_text_iface()
        end = Atspi.Text.get_character_count(t) if t is not None else 0
        return Atspi.EditableText.insert_text(e, end, s, len(s.encode("utf-8")))

    def set_number(self, x):
        from gi.repository import Atspi
        v = self.a.get_value_iface()
        return v is not None and Atspi.Value.set_current_value(v, x)

    def focus(self):
        from gi.repository import Atspi
        try:
            return Atspi.Component.grab_focus(self.a.get_component_iface())
        except Exception:  # some toolkits refuse focus; typing still works
            return False


def secure(n):
    return n.role() == SECURE


def describe(n, path, depth, budget):
    """The node and what is under it, inside the limits. A secure field's text is never asked for."""
    budget[0] -= 1
    d = {"id": path, "role": n.role(), "name": n.name()[:MAX_TEXT]}
    if secure(n):
        d["secure"] = True
    else:
        t = n.text(MAX_TEXT + 1) if "text" in n.role() or "entry" in n.role() or n.editable() else None
        if t:
            d["value"] = t[:MAX_TEXT] + ("…" if len(t) > MAX_TEXT else "")
        else:
            x = n.number()
            if x is not None and any(k in n.role() for k in ("slider", "spin", "scroll bar")):
                d["value"] = x
    st = n.states()
    d["states"] = [s for s in SHOWN_STATES if s in st] + ([] if "enabled" in st or "sensitive" in st else ["disabled"])
    acts = n.actions()
    if acts:
        d["actions"] = acts
    kids = []
    if depth >= MAX_DEPTH:
        if n.count():
            d["truncated"] = True
    else:
        for i in range(n.count()):
            if budget[0] <= 0:
                d["truncated"] = True
                break
            c = n.child(i)
            if c is not None and "showing" in c.states():
                kids.append(describe(c, f"{path}.{i}", depth + 1, budget))
    if kids:
        d["children"] = kids
    return d


def desktop():
    try:
        import gi
        gi.require_version("Atspi", "2.0")
        from gi.repository import Atspi
    except Exception as e:
        raise Fail("no-atspi", f"AT-SPI bindings missing: {e}")
    Atspi.init()
    try:
        return Node(Atspi.get_desktop(0))
    except Exception as e:
        raise Fail("no-a11y", f"accessibility bus unreachable: {e}")


def app_names(root):
    out = []
    for i in range(root.count()):
        try:
            c = root.child(i)
        except Exception:
            continue
        if c is not None and c.name():
            out.append((c.name(), c))
    return out


def find_app(root, want):
    """The one app matching, refused by name before its windows or tree are touched."""
    w, apps = want.lower(), app_names(root)
    hits = [a for a in apps if a[0].lower() == w] or [a for a in apps if w in a[0].lower()]
    if not hits:
        raise Fail("app-not-found", f"no app named {want}")
    if len(hits) > 1:
        raise Fail("ambiguous-app", "several apps match: " + ", ".join(h[0] for h in hits))
    if blocked(hits[0][0]):
        raise Fail("blocked-app", f"{hits[0][0]} is a password manager")
    return hits[0][1]


def windows_of(app):
    out = []
    for i in range(app.count()):
        w = app.child(i)
        if w is not None:
            out.append((i, w))
    return out


def resolve(app, path):
    n = app
    try:
        for p in str(path).split("."):
            n = n.child(int(p))
            if n is None:
                raise ValueError
    except Exception:
        raise Fail("stale-ref", f"no node {path}")
    return n


def check():
    out = {"python": sys.version.split()[0], "session": os.environ.get("XDG_SESSION_TYPE") or "unknown"}
    try:
        root = desktop()
        out.update(atspi=True, a11y=True, apps=root.count())
    except Fail as f:
        out.update(atspi=f.code != "no-atspi", a11y=False, error=f.msg)
    out["ok"] = bool(out.get("a11y"))
    return out


def switched_on():
    """The user's on-list, read here too: run by hand with the skill off, the helper refuses."""
    try:
        with open(os.path.join(os.path.expanduser("~"), ".kaizen", "skills-on.json"), encoding="utf8") as f:
            return "kaizen-computer" in json.load(f)
    except (OSError, ValueError, TypeError):
        return False


def run(verb, a):
    if verb == "check":
        return check()
    if not switched_on():
        raise Fail("disabled", "Desktop control is turned off")
    need = {"apps": 0, "windows": 1, "state": (1, 2), "click": 2, "set-value": 3, "type": 3}.get(verb)
    if need is None or len(a) not in ((need,) if isinstance(need, int) else need):
        raise Fail("bad-usage", f"bad call: {verb}")
    root = desktop()
    if verb == "apps":
        return {"ok": True, "apps": [{"name": n, "windows": c.count(), "blocked": blocked(n)} for n, c in app_names(root)]}
    app = find_app(root, a[0])
    if verb == "windows":
        return {"ok": True, "app": a[0], "windows": [{"index": i, "title": w.name()} for i, w in windows_of(app)]}
    if verb == "state":
        ws = windows_of(app)
        i = int(a[1]) if len(a) > 1 and a[1].isdigit() else (ws[0][0] if ws else None)
        w = next((w for j, w in ws if j == i), None)
        if w is None:
            raise Fail("window-not-found", "no such window")
        budget = [MAX_NODES]
        tree = describe(w, str(i), 0, budget)
        return {"ok": True, "app": a[0], "window": i, "nodes": MAX_NODES - budget[0], "tree": tree}
    return act(app, verb, a)


def act(app, verb, a):
    n = resolve(app, a[1])
    if verb == "click":
        names = n.actions()
        pick = next((i for i, x in enumerate(names) if x.lower() in CLICK_NAMES), 0 if names else None)
        if pick is None:
            raise Fail("no-action", "that node has no action")
        n.do(pick)
        time.sleep(SETTLE)
        return {"ok": True, "did": names[pick]}
    # set-value and type: a secure field is refused before any text is read or written.
    if secure(n):
        raise Fail("secure-field", "that field is a password field")
    text = a[2]
    if len(text) > MAX_INPUT:
        raise Fail("too-large", "text over the input limit")
    if verb == "set-value":
        if n.editable():
            n.set_text(text)
        else:
            try:
                x = float(text)
            except ValueError:
                raise Fail("not-editable", "that node takes a number, not text")
            if not n.set_number(x):
                raise Fail("not-editable", "that node cannot be set")
        time.sleep(SETTLE)
        got = n.text(MAX_TEXT) if n.editable() else n.number()
        return {"ok": True, "value": got}
    if not n.editable():
        raise Fail("not-editable", "that node is not an editable field")
    n.focus()
    n.append_text(text)
    time.sleep(SETTLE)
    return {"ok": True, "value": n.text(MAX_TEXT)}


def main(argv):
    try:
        out = run(argv[0] if argv else "", argv[1:])
    except Fail as f:
        out = {"ok": False, "code": f.code, "error": f.msg}
    except Exception as e:  # a toolkit error is reported, not a traceback
        out = {"ok": False, "code": "helper-failed", "error": f"{type(e).__name__}: {e}"}
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1:])
